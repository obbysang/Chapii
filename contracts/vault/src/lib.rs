mod events;
mod policy;
mod types;

#[cfg(test)]
mod tests;

use events::emit;
use near_sdk::json_types::U128;
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{
    env, near, AccountId, Allowance, Gas, NearToken, Promise, PublicKey,
};
use policy::{
    bump_rate, bump_violation, canonicalize_policy, evaluate, evaluate_approval, normalize_args,
    normalize_chain, valid_client_ref, validate_policy, EvalInput, DAY_NS, HOUR_NS,
};
use types::*;

const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(30);
const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(25);
const APPROVAL_WINDOW_NS: u64 = 24 * HOUR_NS;
const EXECUTION_WINDOW_NS: u64 = 15 * 60 * 1_000_000_000;

#[near(contract_state)]
pub struct Vault {
    owner_id: AccountId,
    executor_id: Option<AccountId>,
    paused: bool,
    agents: IterableMap<PublicKey, Agent>,
    requests: IterableMap<u64, PaymentRequest>,
    /// "<agent_pk>|<client_ref>" -> request id
    client_refs: LookupMap<String, u64>,
    next_request_id: u64,
    change_seq: u64,
    /// seq -> request id; serves the incremental indexer feed.
    change_log: IterableMap<u64, u64>,
}

// The generated bindings read the state with `Option::<Vault>::unwrap_or_default`,
// so the state type needs `Default`. A vault without `new` is a bug, not a fresh
// vault: fail loudly instead of silently starting with an empty owner.
impl Default for Vault {
    fn default() -> Self {
        near_sdk::env::panic_str("AgentVault: state is not initialized; call new first")
    }
}

#[near]
impl Vault {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self {
            owner_id,
            executor_id: None,
            paused: false,
            agents: IterableMap::new(b"a"),
            requests: IterableMap::new(b"r"),
            client_refs: LookupMap::new(b"c"),
            next_request_id: 1,
            change_seq: 0,
            change_log: IterableMap::new(b"l"),
        }
    }

    // -----------------------------------------------------------------------
    // Owner methods
    // -----------------------------------------------------------------------

    pub fn add_agent(
        &mut self,
        public_key: PublicKey,
        name: String,
        policy: Policy,
        allowance_yocto: U128,
    ) -> AgentView {
        self.assert_owner();
        assert!(
            !self.agents.contains_key(&public_key),
            "agent key already registered"
        );
        assert!(
            name.chars().count() <= 40 && !name.trim().is_empty(),
            "agent name must be 1..=40 characters"
        );
        validate_policy(&policy).unwrap_or_else(|e| env::panic_str(&e));
        let policy = canonicalize_policy(&policy);
        assert!(
            allowance_yocto.0 > 0 && allowance_yocto.0 <= 1_000_000_000_000_000_000_000_000,
            "allowance must be 1..=1e24 yoctoNEAR"
        );
        let agent = Agent {
            name,
            status: AgentStatus::Active,
            policy: policy.clone(),
            created_at_ns: env::block_timestamp(),
            usage: Vec::new(),
            rate_hour_bucket: 0,
            rate_count: 0,
            viol_hour_bucket: 0,
            violations: 0,
        };
        self.agents.insert(public_key.clone(), agent.clone());
        self.add_key(&public_key, allowance_yocto.0);
        emit(
            "agent_added",
            serde_json::json!({
                "public_key": &public_key,
                "name": &agent.name,
                "policy": policy,
            }),
        );
        AgentView {
            public_key,
            agent,
        }
    }

    pub fn update_policy(&mut self, public_key: PublicKey, policy: Policy) {
        self.assert_owner();
        let mut agent = self.get_agent_or_panic(&public_key);
        assert_ne!(agent.status, AgentStatus::Revoked, "agent is revoked");
        validate_policy(&policy).unwrap_or_else(|e| env::panic_str(&e));
        let policy = canonicalize_policy(&policy);
        agent.policy = policy.clone();
        self.agents.insert(public_key.clone(), agent);
        emit(
            "agent_policy_updated",
            serde_json::json!({"public_key": public_key, "policy": policy}),
        );
    }

    pub fn set_allowance(&mut self, public_key: PublicKey, allowance_yocto: U128) {
        self.assert_owner();
        let agent = self.get_agent_or_panic(&public_key);
        assert_ne!(agent.status, AgentStatus::Revoked, "agent is revoked");
        assert!(
            allowance_yocto.0 > 0 && allowance_yocto.0 <= 1_000_000_000_000_000_000_000_000,
            "allowance must be 1..=1e24 yoctoNEAR"
        );
        Promise::new(env::current_account_id())
            .delete_key(public_key.clone())
            .add_access_key_allowance(
                public_key.clone(),
                Allowance::limited(NearToken::from_yoctonear(allowance_yocto.0))
                    .expect("allowance must be > 0"),
                env::current_account_id(),
                "request_payment".to_string(),
            )
            .detach();
        emit(
            "agent_allowance_set",
            serde_json::json!({"public_key": public_key, "allowance_yocto": allowance_yocto}),
        );
    }

    pub fn freeze_agent(&mut self, public_key: PublicKey) {
        self.assert_owner();
        let mut agent = self.get_agent_or_panic(&public_key);
        assert_ne!(agent.status, AgentStatus::Revoked, "agent is revoked");
        agent.status = AgentStatus::Frozen;
        self.agents.insert(public_key.clone(), agent);
        emit("agent_frozen", serde_json::json!({"public_key": public_key}));
    }

    pub fn unfreeze_agent(&mut self, public_key: PublicKey) {
        self.assert_owner();
        let mut agent = self.get_agent_or_panic(&public_key);
        assert_ne!(agent.status, AgentStatus::Revoked, "agent is revoked");
        agent.status = AgentStatus::Active;
        agent.violations = 0;
        agent.viol_hour_bucket = 0;
        self.agents.insert(public_key.clone(), agent);
        emit("agent_unfrozen", serde_json::json!({"public_key": public_key}));
    }

    pub fn revoke_agent(&mut self, public_key: PublicKey) {
        self.assert_owner();
        let mut agent = self.get_agent_or_panic(&public_key);
        agent.status = AgentStatus::Revoked;
        self.agents.insert(public_key.clone(), agent);
        Promise::new(env::current_account_id())
            .delete_key(public_key.clone())
            .detach();
        emit("agent_revoked", serde_json::json!({"public_key": public_key}));
    }

    pub fn pause(&mut self) {
        self.assert_owner();
        self.paused = true;
        emit("vault_paused", serde_json::json!({"paused": true}));
    }

    pub fn unpause(&mut self) {
        self.assert_owner();
        self.paused = false;
        emit("vault_unpaused", serde_json::json!({"paused": false}));
    }

    pub fn set_executor(&mut self, account_id: Option<AccountId>) {
        self.assert_owner();
        self.executor_id = account_id.clone();
        emit(
            "executor_set",
            serde_json::json!({"executor_id": account_id}),
        );
    }

    pub fn approve_request(&mut self, request_id: u64) {
        self.assert_owner();
        let mut request = self
            .requests
            .get(&request_id)
            .cloned()
            .expect("unknown request");
        assert_eq!(
            request.status,
            RequestStatus::PendingApproval,
            "request is not pending approval"
        );
        let now = env::block_timestamp();
        if now.saturating_sub(request.created_ns) > APPROVAL_WINDOW_NS {
            request.status = RequestStatus::Expired;
            request.reason = Some(ReasonCode::ApprovalExpired);
            request.decided_ns = Some(now);
            self.requests.insert(request_id, request.clone());
            self.touch(request_id);
            emit(
                "owner_rejected",
                serde_json::json!({"request_id": request_id, "reason": "APPROVAL_EXPIRED"}),
            );
            return;
        }
        let mut agent = self.get_agent_or_panic(&request.agent_pk);
        let day_bucket = now / DAY_NS;
        let hour_bucket = now / HOUR_NS;
        let outcome = evaluate_approval(
            self.paused,
            &mut agent,
            &request,
            now,
            day_bucket,
            env::account_balance().as_yoctonear(),
            self.storage_reserve(),
        );
        if let Some(reason) = outcome.reason {
            if outcome.violation && bump_violation(&mut agent, hour_bucket) {
                agent.status = AgentStatus::Frozen;
                emit(
                    "agent_auto_frozen",
                    serde_json::json!({
                        "public_key": &request.agent_pk,
                        "violations": agent.violations,
                    }),
                );
            }
            request.status = outcome.status;
            request.reason = Some(reason);
            request.decided_ns = Some(now);
            self.agents.insert(request.agent_pk.clone(), agent);
            self.requests.insert(request_id, request.clone());
            self.touch(request_id);
            emit(
                "payment_rejected",
                serde_json::json!({
                    "request_id": request_id,
                    "reason": reason,
                    "status": request.status,
                }),
            );
            return;
        }

        let spent = agent.spent_in_bucket(&request.asset, day_bucket);
        agent.set_spent(&request.asset, day_bucket, spent.saturating_add(request.amount.0));
        request.usage_day_bucket = day_bucket;
        request.status = outcome.status;
        request.decided_ns = Some(now);
        self.agents.insert(request.agent_pk.clone(), agent);
        self.requests.insert(request_id, request.clone());
        self.touch(request_id);
        emit(
            "owner_approved",
            serde_json::json!({"request_id": request_id}),
        );
        emit(
            "payment_approved",
            serde_json::json!({
                "request_id": request_id,
                "status": request.status,
                "asset": request.asset,
                "amount": request.amount,
                "chain": request.chain,
                "address": request.address,
            }),
        );
        if request.status == RequestStatus::Approved {
            self.send_same_chain(request_id, &request);
        }
    }

    pub fn reject_request(&mut self, request_id: u64) {
        self.assert_owner();
        let mut request = self
            .requests
            .get(&request_id)
            .cloned()
            .expect("unknown request");
        assert_eq!(
            request.status,
            RequestStatus::PendingApproval,
            "request is not pending approval"
        );
        request.status = RequestStatus::RejectedByOwner;
        request.reason = Some(ReasonCode::OwnerRejected);
        request.decided_ns = Some(env::block_timestamp());
        self.requests.insert(request_id, request);
        self.touch(request_id);
        emit(
            "owner_rejected",
            serde_json::json!({"request_id": request_id, "reason": "OWNER_REJECTED"}),
        );
    }

    /// Permissionless cleanup: a pending approval older than 24h can be expired
    /// by anyone (including the indexer) so it no longer blocks the queue.
    pub fn expire_request(&mut self, request_id: u64) {
        let mut request = match self.requests.get(&request_id).cloned() {
            Some(r) => r,
            None => return,
        };
        if request.status != RequestStatus::PendingApproval {
            return;
        }
        let now = env::block_timestamp();
        if now.saturating_sub(request.created_ns) <= APPROVAL_WINDOW_NS {
            return;
        }
        request.status = RequestStatus::Expired;
        request.reason = Some(ReasonCode::ApprovalExpired);
        request.decided_ns = Some(now);
        self.requests.insert(request_id, request);
        self.touch(request_id);
        emit(
            "payment_rejected",
            serde_json::json!({"request_id": request_id, "reason": "APPROVAL_EXPIRED"}),
        );
    }

    pub fn withdraw_near(&mut self, amount: U128, to: AccountId) {
        self.assert_owner();
        assert!(amount.0 > 0, "amount must be > 0");
        assert!(
            amount.0 <= env::account_balance().as_yoctonear().saturating_sub(self.storage_reserve()),
            "insufficient spendable balance"
        );
        Promise::new(to.clone())
            .transfer(NearToken::from_yoctonear(amount.0))
            .detach();
        emit(
            "withdrawal",
            serde_json::json!({"asset": "NEAR", "amount": amount, "to": to}),
        );
    }

    pub fn withdraw_ft(&mut self, token: AccountId, amount: U128, to: AccountId) {
        self.assert_owner();
        assert!(amount.0 > 0, "amount must be > 0");
        Promise::new(token.clone())
            .function_call(
                "ft_transfer".to_string(),
                serde_json::json!({"receiver_id": &to, "amount": U128(amount.0)})
                    .to_string()
                    .into_bytes(),
                NearToken::from_yoctonear(1),
                GAS_FOR_FT_TRANSFER,
            )
            .detach();
        emit(
            "withdrawal",
            serde_json::json!({"asset": format!("ft:{}", token), "amount": amount, "to": to}),
        );
    }

    /// Delete terminal requests to reclaim storage. Cursor-based and bounded.
    pub fn prune_requests(&mut self, up_to_id: u64, limit: u32) -> u32 {
        self.assert_owner();
        let mut removed = 0u32;
        let mut id = 1u64;
        while id <= up_to_id && removed < limit {
            if let Some(request) = self.requests.get(&id) {
                if request.status.is_terminal() {
                    self.requests.remove(&id);
                    removed += 1;
                }
            }
            id += 1;
        }
        removed
    }

    // -----------------------------------------------------------------------
    // Agent method
    // -----------------------------------------------------------------------

    pub fn request_payment(&mut self, args: PaymentArgs) -> Decision {
        let predecessor = env::predecessor_account_id();
        assert_eq!(
            predecessor,
            env::current_account_id(),
            "agent function-call keys may only call this contract"
        );
        let agent_pk = env::signer_account_pk();
        assert!(
            self.agents.contains_key(&agent_pk),
            "signer key is not a registered agent"
        );
        assert!(
            valid_client_ref(&args.client_ref),
            "client_ref must be 1..=64 chars of [A-Za-z0-9_-]"
        );

        let ref_key = format!("{}|{}", agent_pk, args.client_ref);
        if let Some(existing) = self.client_refs.get(&ref_key).copied() {
            if let Some(request) = self.requests.get(&existing) {
                emit(
                    "payment_duplicate",
                    serde_json::json!({
                        "request_id": existing,
                        "agent_pk": agent_pk,
                        "client_ref": args.client_ref,
                        "status": request.status,
                    }),
                );
                return Decision::Duplicate {
                    request_id: existing,
                    status: request.status,
                };
            }
            // The request was pruned; drop the stale idempotency key.
            self.client_refs.remove(&ref_key);
        }

        let normalized = normalize_args(&args);
        let now = env::block_timestamp();
        let hour_bucket = now / HOUR_NS;
        let day_bucket = now / DAY_NS;

        let mut agent = self.get_agent_or_panic(&agent_pk);
        bump_rate(&mut agent, hour_bucket);

        let request_id = self.next_request_id;
        self.next_request_id += 1;

        let mut request = PaymentRequest {
            id: request_id,
            agent_pk: agent_pk.clone(),
            client_ref: args.client_ref.clone(),
            asset: args.asset.clone(),
            amount: args.amount,
            chain: normalized
                .as_ref()
                .map(|n| n.chain.clone())
                .or_else(|| normalize_chain(&args.chain))
                .unwrap_or_else(|| args.chain.to_ascii_lowercase()),
            address: normalized
                .as_ref()
                .map(|n| n.address.clone())
                .unwrap_or_else(|| args.address.clone()),
            dest_asset: normalized
                .as_ref()
                .and_then(|n| n.dest_asset.clone())
                .or_else(|| args.dest_asset.clone()),
            memo: args.memo.clone(),
            status: RequestStatus::Rejected,
            reason: None,
            created_ns: now,
            decided_ns: None,
            deposit_address: None,
            settlement_ref: None,
            last_change_seq: 0,
            usage_day_bucket: 0,
        };

        let outcome = evaluate(EvalInput {
            paused: self.paused,
            agent: &mut agent,
            normalized: normalized.as_ref(),
            now,
            day_bucket,
            hour_bucket,
            balance: env::account_balance().as_yoctonear(),
            storage_reserve: self.storage_reserve(),
        });

        request.status = outcome.status;
        request.reason = outcome.reason;

        if outcome.violation && bump_violation(&mut agent, hour_bucket) {
            agent.status = AgentStatus::Frozen;
            emit(
                "agent_auto_frozen",
                serde_json::json!({
                    "public_key": agent_pk,
                    "violations": agent.violations,
                }),
            );
        }

        match request.status {
            RequestStatus::Approved | RequestStatus::AwaitingExecution => {
                let spent = agent.spent_in_bucket(&request.asset, day_bucket);
                agent.set_spent(
                    &request.asset,
                    day_bucket,
                    spent.saturating_add(request.amount.0),
                );
                request.usage_day_bucket = day_bucket;
                request.decided_ns = Some(now);
            }
            RequestStatus::PendingApproval => {
                request.decided_ns = None;
            }
            _ => {
                request.decided_ns = Some(now);
            }
        }

        self.agents.insert(agent_pk.clone(), agent);
        self.requests.insert(request_id, request.clone());
        self.client_refs.insert(ref_key, request_id);
        self.touch(request_id);

        emit(
            "payment_requested",
            serde_json::json!({
                "request_id": request_id,
                "agent_pk": agent_pk,
                "client_ref": request.client_ref,
                "asset": request.asset,
                "amount": request.amount,
                "chain": request.chain,
                "address": request.address,
                "dest_asset": request.dest_asset,
                "memo": request.memo,
                "status": request.status,
                "reason": request.reason,
            }),
        );

        match request.status {
            RequestStatus::Approved | RequestStatus::AwaitingExecution => {
                emit(
                    "payment_approved",
                    serde_json::json!({
                        "request_id": request_id,
                        "status": request.status,
                        "asset": request.asset,
                        "amount": request.amount,
                        "chain": request.chain,
                        "address": request.address,
                    }),
                );
                if request.status == RequestStatus::Approved {
                    self.send_same_chain(request_id, &request);
                }
                Decision::Approved { request_id }
            }
            RequestStatus::PendingApproval => {
                emit(
                    "payment_pending",
                    serde_json::json!({"request_id": request_id}),
                );
                Decision::PendingApproval { request_id }
            }
            _ => {
                let reason = request.reason.expect("rejected request must have a reason");
                emit(
                    "payment_rejected",
                    serde_json::json!({
                        "request_id": request_id,
                        "reason": reason,
                        "status": request.status,
                    }),
                );
                Decision::Rejected {
                    request_id,
                    reason,
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    // Executor methods
    // -----------------------------------------------------------------------

    pub fn execute_crosschain(&mut self, request_id: u64, deposit_address: AccountId) {
        let executor = self
            .executor_id
            .clone()
            .expect("executor is not configured");
        assert_eq!(env::predecessor_account_id(), executor, "only executor");
        let mut request = self
            .requests
            .get(&request_id)
            .cloned()
            .expect("unknown request");
        assert_eq!(
            request.status,
            RequestStatus::AwaitingExecution,
            "request is not awaiting execution"
        );
        let now = env::block_timestamp();
        assert!(
            now.saturating_sub(request.created_ns) <= EXECUTION_WINDOW_NS,
            "execution window elapsed"
        );
        assert!(!self.paused, "vault is paused");
        let agent = self.get_agent_or_panic(&request.agent_pk);
        assert_eq!(agent.status, AgentStatus::Active, "agent is not active");
        let token = match &request.asset {
            Asset::Ft(token) => token.clone(),
            Asset::Near => env::panic_str("cross-chain payouts require a NEP-141 asset"),
        };

        request.deposit_address = Some(deposit_address.to_string());
        request.status = RequestStatus::Executing;
        self.requests.insert(request_id, request.clone());
        self.touch(request_id);

        Promise::new(token).function_call(
            "ft_transfer".to_string(),
            serde_json::json!({
                "receiver_id": deposit_address,
                "amount": request.amount,
                "memo": request.memo,
            })
            .to_string()
            .into_bytes(),
            NearToken::from_yoctonear(1),
            GAS_FOR_FT_TRANSFER,
        )
        .then(Promise::new(env::current_account_id()).function_call(
            "on_crosschain_funded".to_string(),
            serde_json::json!({"request_id": request_id})
                .to_string()
                .into_bytes(),
            NearToken::from_yoctonear(0),
            GAS_FOR_CALLBACK,
        ))
        .detach();
    }

    pub fn report_crosschain_result(
        &mut self,
        request_id: u64,
        outcome: CrosschainOutcome,
        settlement_ref: String,
    ) {
        let executor = self
            .executor_id
            .clone()
            .expect("executor is not configured");
        assert_eq!(env::predecessor_account_id(), executor, "only executor");
        let mut request = self
            .requests
            .get(&request_id)
            .cloned()
            .expect("unknown request");
        assert_eq!(
            request.status,
            RequestStatus::Executing,
            "request is not executing"
        );
        let now = env::block_timestamp();
        request.settlement_ref = Some(settlement_ref.clone());
        request.decided_ns = Some(now);
        match outcome {
            CrosschainOutcome::Delivered => {
                request.status = RequestStatus::Completed;
                self.requests.insert(request_id, request.clone());
                self.touch(request_id);
                emit(
                    "crosschain_settled",
                    serde_json::json!({
                        "request_id": request_id,
                        "outcome": "DELIVERED",
                        "settlement_ref": settlement_ref,
                    }),
                );
                emit(
                    "payment_completed",
                    serde_json::json!({"request_id": request_id}),
                );
            }
            CrosschainOutcome::Refunded | CrosschainOutcome::Failed => {
                request.status = RequestStatus::Failed;
                request.reason = Some(ReasonCode::TransferFailed);
                self.requests.insert(request_id, request.clone());
                self.rollback_usage(&request);
                self.touch(request_id);
                emit(
                    "crosschain_settled",
                    serde_json::json!({
                        "request_id": request_id,
                        "outcome": "FAILED",
                        "settlement_ref": settlement_ref,
                    }),
                );
                emit(
                    "payment_failed",
                    serde_json::json!({
                        "request_id": request_id,
                        "reason": ReasonCode::TransferFailed,
                    }),
                );
            }
        }
    }

    // -----------------------------------------------------------------------
    // Callbacks
    // -----------------------------------------------------------------------

    #[private]
    pub fn on_payment_resolved(&mut self, request_id: u64) {
        let mut request = match self.requests.get(&request_id).cloned() {
            Some(r) => r,
            None => return,
        };
        if request.status != RequestStatus::Approved {
            return;
        }
        // Transfers return no data, so the size bound is only there to stop an
        // unbounded register read. Anything else counts as a failed transfer.
        let ok = env::promise_result_checked(0, 1024).is_ok();
        request.decided_ns = Some(env::block_timestamp());
        if ok {
            request.status = RequestStatus::Completed;
            self.requests.insert(request_id, request.clone());
            self.touch(request_id);
            emit(
                "payment_completed",
                serde_json::json!({"request_id": request_id}),
            );
        } else {
            request.status = RequestStatus::Failed;
            request.reason = Some(ReasonCode::TransferFailed);
            self.requests.insert(request_id, request.clone());
            self.rollback_usage(&request);
            self.touch(request_id);
            emit(
                "payment_failed",
                serde_json::json!({
                    "request_id": request_id,
                    "reason": ReasonCode::TransferFailed,
                }),
            );
        }
    }

    #[private]
    pub fn on_crosschain_funded(&mut self, request_id: u64) {
        let mut request = match self.requests.get(&request_id).cloned() {
            Some(r) => r,
            None => return,
        };
        if request.status != RequestStatus::Executing {
            return;
        }
        let ok = env::promise_result_checked(0, 1024).is_ok();
        if ok {
            emit(
                "crosschain_funded",
                serde_json::json!({
                    "request_id": request_id,
                    "deposit_address": request.deposit_address,
                }),
            );
        } else {
            request.status = RequestStatus::Failed;
            request.reason = Some(ReasonCode::TransferFailed);
            request.decided_ns = Some(env::block_timestamp());
            self.requests.insert(request_id, request.clone());
            self.rollback_usage(&request);
            self.touch(request_id);
            emit(
                "payment_failed",
                serde_json::json!({
                    "request_id": request_id,
                    "reason": ReasonCode::TransferFailed,
                }),
            );
        }
    }

    // -----------------------------------------------------------------------
    // Views
    // -----------------------------------------------------------------------

    pub fn get_owner(&self) -> AccountId {
        self.owner_id.clone()
    }

    pub fn get_executor(&self) -> Option<AccountId> {
        self.executor_id.clone()
    }

    pub fn is_paused(&self) -> bool {
        self.paused
    }

    pub fn get_version(&self) -> String {
        "1.0.0".to_string()
    }

    pub fn get_next_request_id(&self) -> u64 {
        self.next_request_id
    }

    pub fn get_change_seq(&self) -> u64 {
        self.change_seq
    }

    pub fn get_agents(&self, from_index: u32, limit: u32) -> Vec<AgentView> {
        self.agents
            .iter()
            .skip(from_index as usize)
            .take(limit.min(100) as usize)
            .map(|(public_key, agent)| AgentView {
                public_key: public_key.clone(),
                agent: agent.clone(),
            })
            .collect()
    }

    pub fn get_agent(&self, public_key: PublicKey) -> Option<Agent> {
        self.agents.get(&public_key).cloned()
    }

    pub fn get_budget(&self, public_key: PublicKey) -> Option<Budget> {
        let agent = self.agents.get(&public_key)?;
        let now = env::block_timestamp();
        let day_bucket = now / DAY_NS;
        let hour_bucket = now / HOUR_NS;
        let per_asset = agent
            .policy
            .limits
            .iter()
            .map(|limit| {
                let spent = agent.spent_in_bucket(&limit.asset, day_bucket);
                BudgetEntry {
                    asset: limit.asset.clone(),
                    daily_max: limit.daily_max,
                    spent_today: U128(spent),
                    remaining: U128(limit.daily_max.0.saturating_sub(spent)),
                    per_tx_max: limit.per_tx_max,
                    cosign_above: limit.cosign_above,
                }
            })
            .collect();
        let rate_remaining = if agent.rate_hour_bucket == hour_bucket {
            agent
                .policy
                .max_requests_per_hour
                .saturating_sub(agent.rate_count)
        } else {
            agent.policy.max_requests_per_hour
        };
        let violations = if agent.viol_hour_bucket == hour_bucket {
            agent.violations
        } else {
            0
        };
        Some(Budget {
            per_asset,
            rate_remaining,
            violations,
            status: agent.status,
            expires_at_ns: agent.policy.expires_at_ns,
        })
    }

    pub fn get_request(&self, request_id: u64) -> Option<PaymentRequest> {
        self.requests.get(&request_id).cloned()
    }

    /// Forward: ids >= from_id ascending. Reverse: ids < from_id descending
    /// (pass u64::MAX to start from the newest request).
    pub fn get_requests(&self, from_id: u64, limit: u32, reverse: bool) -> Vec<PaymentRequest> {
        let mut items: Vec<PaymentRequest> = self
            .requests
            .iter()
            .filter(|(id, _)| {
                if reverse {
                    **id < from_id
                } else {
                    **id >= from_id
                }
            })
            .map(|(_, r)| r.clone())
            .collect();
        items.sort_by_key(|r| r.id);
        if reverse {
            items.reverse();
        }
        items.into_iter().take(limit.min(200) as usize).collect()
    }

    pub fn get_pending_requests(&self) -> Vec<PaymentRequest> {
        let mut items: Vec<PaymentRequest> = self
            .requests
            .iter()
            .filter(|(_, r)| r.status == RequestStatus::PendingApproval)
            .map(|(_, r)| r.clone())
            .collect();
        items.sort_by_key(|r| r.id);
        items
    }

    pub fn get_changes_since(&self, since_seq: u64, limit: u32) -> ChangesPage {
        let limit = limit.clamp(1, 200) as usize;
        let mut seen: Vec<u64> = Vec::new();
        let mut requests = Vec::new();
        let mut latest_seq = since_seq;
        for (seq, request_id) in self.change_log.iter() {
            if *seq <= since_seq {
                continue;
            }
            latest_seq = *seq;
            if seen.contains(request_id) {
                continue;
            }
            if let Some(request) = self.requests.get(request_id) {
                seen.push(*request_id);
                requests.push(request.clone());
                if requests.len() >= limit {
                    break;
                }
            }
        }
        ChangesPage {
            requests,
            latest_seq: latest_seq.max(since_seq),
        }
    }

    pub fn get_storage_info(&self) -> StorageInfo {
        let balance = env::account_balance().as_yoctonear();
        let reserve = self.storage_reserve();
        StorageInfo {
            balance: U128(balance),
            storage_reserve: U128(reserve),
            spendable: U128(balance.saturating_sub(reserve)),
        }
    }
}

// Internal helpers (not exported as contract methods).
impl Vault {
    fn assert_owner(&self) {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner_id,
            "only the vault owner can call this method"
        );
    }

    fn get_agent_or_panic(&self, public_key: &PublicKey) -> Agent {
        self.agents
            .get(public_key)
            .cloned()
            .unwrap_or_else(|| env::panic_str("unknown agent key"))
    }

    fn add_key(&self, public_key: &PublicKey, allowance: u128) {
        Promise::new(env::current_account_id())
            .add_access_key_allowance(
                public_key.clone(),
                Allowance::limited(NearToken::from_yoctonear(allowance))
                    .expect("allowance must be > 0"),
                env::current_account_id(),
                "request_payment".to_string(),
            )
            .detach();
    }

    fn storage_reserve(&self) -> u128 {
        env::storage_byte_cost()
            .as_yoctonear()
            .saturating_mul(env::storage_usage() as u128)
    }

    fn touch(&mut self, request_id: u64) {
        self.change_seq += 1;
        let seq = self.change_seq;
        self.change_log.insert(seq, request_id);
        if let Some(request) = self.requests.get_mut(&request_id) {
            request.last_change_seq = seq;
        }
    }

    fn rollback_usage(&mut self, request: &PaymentRequest) {
        let current_day = env::block_timestamp() / DAY_NS;
        if current_day != request.usage_day_bucket {
            return;
        }
        if let Some(mut agent) = self.agents.get(&request.agent_pk).cloned() {
            let spent = agent.spent_in_bucket(&request.asset, current_day);
            agent.set_spent(
                &request.asset,
                current_day,
                spent.saturating_sub(request.amount.0),
            );
            self.agents.insert(request.agent_pk.clone(), agent);
        }
    }

    fn send_same_chain(&self, request_id: u64, request: &PaymentRequest) {
        let callback = Promise::new(env::current_account_id()).function_call(
            "on_payment_resolved".to_string(),
            serde_json::json!({"request_id": request_id})
                .to_string()
                .into_bytes(),
            NearToken::from_yoctonear(0),
            GAS_FOR_CALLBACK,
        );
        match &request.asset {
            Asset::Near => {
                let to = AccountId::try_from(request.address.clone())
                    .unwrap_or_else(|_| env::panic_str("invalid NEAR payee address"));
                Promise::new(to)
                    .transfer(NearToken::from_yoctonear(request.amount.0))
                    .then(callback)
                    .detach();
            }
            Asset::Ft(token) => {
                let to = AccountId::try_from(request.address.clone())
                    .unwrap_or_else(|_| env::panic_str("invalid NEAR payee address"));
                Promise::new(token.clone())
                    .function_call(
                        "ft_transfer".to_string(),
                        serde_json::json!({
                            "receiver_id": to,
                            "amount": request.amount,
                            "memo": request.memo,
                        })
                        .to_string()
                        .into_bytes(),
                        NearToken::from_yoctonear(1),
                        GAS_FOR_FT_TRANSFER,
                    )
                    .then(callback)
                    .detach();
            }
        }
    }
}
