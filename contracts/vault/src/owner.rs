use crate::agent::{reason_str, validate_name, validate_policy};
use crate::events;
use crate::types::{Agent, AgentStatus, PaymentArgs, Policy, ReasonCode, RequestStatus};
use crate::Vault;
use near_sdk::json_types::U128;
use near_sdk::{env, require, AccountId, Allowance, NearToken, Promise, PublicKey};

impl Vault {
    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "caller is not the vault owner"
        );
    }

    pub(crate) fn add_agent_inner(
        &mut self,
        public_key: PublicKey,
        name: String,
        policy: Policy,
        allowance_yocto: U128,
    ) -> Promise {
        self.assert_owner();
        require!(validate_name(&name), "invalid agent name");
        validate_policy(&policy).unwrap_or_else(|e| env::panic_str(&e));
        let pk_str = public_key.to_string();
        require!(!self.agents.contains_key(&pk_str), "agent already exists");
        let agent = Agent {
            name: name.clone(),
            status: AgentStatus::Active,
            policy,
            created_at_ns: env::block_timestamp(),
            usage: Vec::new(),
            rate_hour_bucket: 0,
            rate_count: 0,
            viol_hour_bucket: 0,
            violations: 0,
        };
        self.agents.insert(pk_str.clone(), agent);
        events::emit_agent_added(&pk_str, &name);
        Promise::new(env::current_account_id()).add_access_key_allowance(
            public_key,
            Allowance::limited(NearToken::from_yoctonear(allowance_yocto.0)).unwrap(),
            env::current_account_id(),
            "request_payment",
        )
    }

    pub(crate) fn update_policy_inner(&mut self, public_key: PublicKey, policy: Policy) {
        self.assert_owner();
        validate_policy(&policy).unwrap_or_else(|e| env::panic_str(&e));
        let pk_str = public_key.to_string();
        let mut agent = self.agents.get(&pk_str).cloned().unwrap_or_else(|| env::panic_str("unknown agent"));
        agent.policy = policy;
        self.agents.insert(pk_str.clone(), agent);
        events::emit_agent_policy_updated(&pk_str);
    }

    pub(crate) fn set_allowance_inner(&mut self, public_key: PublicKey, allowance_yocto: U128) -> Promise {
        self.assert_owner();
        let pk_str = public_key.to_string();
        require!(self.agents.contains_key(&pk_str), "unknown agent");
        events::emit_agent_allowance_set(&pk_str, &allowance_yocto.0.to_string());
        Promise::new(env::current_account_id())
            .delete_key(public_key.clone())
            .then(
                Promise::new(env::current_account_id()).add_access_key_allowance(
                    public_key,
                    Allowance::limited(NearToken::from_yoctonear(allowance_yocto.0)).unwrap(),
                    env::current_account_id(),
                    "request_payment",
                ),
            )
    }

    pub(crate) fn freeze_agent_inner(&mut self, public_key: PublicKey) {
        self.assert_owner();
        let pk_str = public_key.to_string();
        let mut agent = self.agents.get(&pk_str).cloned().unwrap_or_else(|| env::panic_str("unknown agent"));
        agent.status = AgentStatus::Frozen;
        self.agents.insert(pk_str.clone(), agent);
        events::emit_agent_frozen(&pk_str);
    }

    pub(crate) fn unfreeze_agent_inner(&mut self, public_key: PublicKey) {
        self.assert_owner();
        let pk_str = public_key.to_string();
        let mut agent = self.agents.get(&pk_str).cloned().unwrap_or_else(|| env::panic_str("unknown agent"));
        agent.status = AgentStatus::Active;
        agent.violations = 0;
        self.agents.insert(pk_str.clone(), agent);
        events::emit_agent_unfrozen(&pk_str);
    }

    pub(crate) fn revoke_agent_inner(&mut self, public_key: PublicKey) -> Promise {
        self.assert_owner();
        let pk_str = public_key.to_string();
        let mut agent = self.agents.get(&pk_str).cloned().unwrap_or_else(|| env::panic_str("unknown agent"));
        agent.status = AgentStatus::Revoked;
        self.agents.insert(pk_str.clone(), agent);
        events::emit_agent_revoked(&pk_str);
        Promise::new(env::current_account_id()).delete_key(public_key)
    }

    pub(crate) fn pause_inner(&mut self) {
        self.assert_owner();
        self.paused = true;
        events::emit_vault_paused();
    }

    pub(crate) fn unpause_inner(&mut self) {
        self.assert_owner();
        self.paused = false;
        events::emit_vault_unpaused();
    }

    pub(crate) fn approve_request_inner(&mut self, request_id: u64) -> bool {
        self.assert_owner();
        let mut req = self.requests.get(&request_id).cloned().unwrap_or_else(|| env::panic_str("unknown request"));
        require!(req.status == RequestStatus::PendingApproval, "request is not pending approval");
        let age = env::block_timestamp().saturating_sub(req.created_ns);
        if age > crate::policy::APPROVAL_TTL_NS {
            req.status = RequestStatus::Rejected;
            req.reason = Some(ReasonCode::ApprovalExpired);
            req.decided_ns = Some(env::block_timestamp());
            self.requests.insert(request_id, req);
            self.bump_change(request_id);
            events::emit_payment_rejected(request_id, reason_str(ReasonCode::ApprovalExpired));
            return false;
        }
        if self.paused {
            return self.reject_approval(req, ReasonCode::VaultPaused);
        }
        let agent_pk = req.agent_pk.to_string();
        let agent = self.agents.get(&agent_pk).cloned().unwrap_or_else(|| env::panic_str("unknown agent"));
        if agent.status != AgentStatus::Active {
            return self.reject_approval(req, ReasonCode::AgentFrozen);
        }
        if let Some(exp) = agent.policy.expires_at_ns {
            if env::block_timestamp() > exp {
                return self.reject_approval(req, ReasonCode::PolicyExpired);
            }
        }
        let limit = match agent.policy.limits.iter().find(|l| l.asset == req.asset) {
            Some(l) => l.clone(),
            None => return self.reject_approval(req, ReasonCode::AssetNotAllowed),
        };
        let chain = req.chain.clone();
        let address = req.address.clone();
        let payee_ok = agent.policy.payees.iter().any(|p| {
            let pc = crate::policy::normalize_chain(&p.chain).unwrap_or_else(|| p.chain.clone());
            let pa = crate::policy::normalize_address(&pc, &p.address).unwrap_or_else(|| p.address.clone());
            pc == chain && pa == address
        });
        if !payee_ok {
            return self.reject_approval(req, ReasonCode::PayeeNotAllowed);
        }
        let spent = self.spent_today(&agent, &req.asset, self.day_bucket());
        match spent.checked_add(req.amount.0) {
            Some(new_spent) if new_spent <= limit.daily_max.0 => {}
            _ => return self.reject_approval(req, ReasonCode::DailyCapExceeded),
        }
        self.add_usage(&agent_pk, &req.asset, req.amount.0, self.day_bucket());
        req.decided_ns = Some(env::block_timestamp());
        if chain == "near" {
            req.status = RequestStatus::Approved;
            self.requests.insert(request_id, req.clone());
            self.bump_change(request_id);
            events::emit_owner_approved(request_id);
            let args = PaymentArgs {
                client_ref: req.client_ref.clone(),
                asset: req.asset.clone(),
                amount: req.amount,
                chain: req.chain.clone(),
                address: req.address.clone(),
                dest_asset: req.dest_asset.clone(),
                memo: req.memo.clone(),
            };
            self.pay_same_chain(&req, &args);
        } else {
            req.status = RequestStatus::AwaitingExecution;
            self.requests.insert(request_id, req);
            self.bump_change(request_id);
            events::emit_owner_approved(request_id);
        }
        true
    }

    fn reject_approval(&mut self, mut req: crate::types::PaymentRequest, reason: ReasonCode) -> bool {
        req.status = RequestStatus::Rejected;
        req.reason = Some(reason);
        req.decided_ns = Some(env::block_timestamp());
        let id = req.id;
        self.requests.insert(id, req);
        self.bump_change(id);
        events::emit_payment_rejected(id, &reason_str(reason));
        false
    }

    pub(crate) fn reject_request_inner(&mut self, request_id: u64) {
        self.assert_owner();
        let mut req = self.requests.get(&request_id).cloned().unwrap_or_else(|| env::panic_str("unknown request"));
        require!(req.status == RequestStatus::PendingApproval, "request is not pending approval");
        req.status = RequestStatus::RejectedByOwner;
        req.reason = Some(ReasonCode::OwnerRejected);
        req.decided_ns = Some(env::block_timestamp());
        self.requests.insert(request_id, req);
        self.bump_change(request_id);
        events::emit_owner_rejected(request_id);
    }

    pub(crate) fn set_executor_inner(&mut self, account_id: Option<AccountId>) {
        self.assert_owner();
        self.executor_id = account_id.clone();
        events::emit_executor_set(account_id.as_ref().map(|a| a.as_str()));
    }

    pub(crate) fn withdraw_near_inner(&mut self, amount: U128, to: AccountId) -> Promise {
        self.assert_owner();
        require!(amount.0 > 0, "amount must be positive");
        events::emit_withdrawal("NEAR", &amount.0.to_string(), to.as_str());
        Promise::new(to).transfer(NearToken::from_yoctonear(amount.0))
    }

    pub(crate) fn withdraw_ft_inner(&mut self, token: AccountId, amount: U128, to: AccountId) -> Promise {
        self.assert_owner();
        require!(amount.0 > 0, "amount must be positive");
        events::emit_withdrawal(&format!("ft:{}", token.as_str()), &amount.0.to_string(), to.as_str());
        Promise::new(token).function_call(
            "ft_transfer".to_string(),
            serde_json::to_vec(&serde_json::json!({ "receiver_id": to, "amount": amount, "memo": "" }))
                .unwrap_or_default(),
            NearToken::from_yoctonear(1),
            near_sdk::Gas::from_tgas(50),
        )
    }

    pub(crate) fn prune_requests_inner(&mut self, up_to_id: u64, limit: u64) -> u64 {
        self.assert_owner();
        let mut deleted: u64 = 0;
        let ids: Vec<u64> = self
            .requests
            .iter()
            .map(|(k, _)| *k)
            .filter(|k| *k <= up_to_id)
            .collect();
        for id in ids {
            if deleted >= limit {
                break;
            }
            if let Some(req) = self.requests.get(&id).cloned() {
                match req.status {
                    RequestStatus::Completed
                    | RequestStatus::Failed
                    | RequestStatus::Rejected
                    | RequestStatus::RejectedByOwner
                    | RequestStatus::Expired => {
                        self.requests.remove(&id);
                        deleted = deleted.saturating_add(1);
                    }
                    _ => {}
                }
            }
        }
        deleted
    }
}
