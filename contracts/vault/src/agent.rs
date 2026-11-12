use crate::events;
use crate::policy::{
    normalize_address, normalize_chain, valid_client_ref, valid_memo, EXECUTION_WINDOW_NS,
    MAX_CHAIN_LEN, MAX_CLIENT_REF_LEN, MAX_LABEL_LEN, MAX_LIMITS, MAX_MEMO_LEN, MAX_NAME_LEN,
    MAX_PAYEES,
};
use crate::types::{
    Agent, AgentStatus, Asset, AssetLimit, Decision, PaymentArgs, PaymentRequest, Payee, Policy,
    ReasonCode, RequestStatus,
};
use crate::Vault;
use near_sdk::json_types::U128;
use near_sdk::{env, near, require, AccountId, Allowance, NearToken, Promise, PublicKey};

pub fn validate_policy(policy: &Policy) -> Result<(), String> {
    if policy.limits.is_empty() || policy.limits.len() > MAX_LIMITS {
        return Err(format!("limits must have 1..={} entries", MAX_LIMITS));
    }
    for (i, l) in policy.limits.iter().enumerate() {
        for (j, l2) in policy.limits.iter().enumerate() {
            if i < j && l.asset == l2.asset {
                return Err("duplicate asset in limits".to_string());
            }
        }
        if l.per_tx_max.0 > l.daily_max.0 {
            return Err("per_tx_max must be <= daily_max".to_string());
        }
        if let Some(c) = l.cosign_above {
            if c.0 > l.per_tx_max.0 {
                return Err("cosign_above must be <= per_tx_max".to_string());
            }
        }
    }
    if policy.payees.len() > MAX_PAYEES {
        return Err(format!("payees must be <= {}", MAX_PAYEES));
    }
    for p in &policy.payees {
        if p.label.len() > MAX_LABEL_LEN {
            return Err("payee label too long".to_string());
        }
        let chain = normalize_chain(&p.chain).ok_or("invalid payee chain")?;
        normalize_address(&chain, &p.address).ok_or("invalid payee address")?;
    }
    if policy.max_requests_per_hour == 0 || policy.max_requests_per_hour > 200 {
        return Err("max_requests_per_hour must be 1..=200".to_string());
    }
    if policy.freeze_after_violations > 20 {
        return Err("freeze_after_violations must be 0..=20".to_string());
    }
    Ok(())
}

pub fn validate_name(name: &str) -> bool {
    !name.is_empty() && name.len() <= MAX_NAME_LEN
}

impl Vault {
    pub(crate) fn spent_today(&self, agent: &Agent, asset: &Asset, day_bucket: u64) -> u128 {
        agent
            .usage
            .iter()
            .find(|u| &u.asset == asset && u.day_bucket == day_bucket)
            .map(|u| u.spent.0)
            .unwrap_or(0)
    }

    pub(crate) fn add_usage(&mut self, agent_pk: &str, asset: &Asset, amount: u128, day_bucket: u64) {
        if let Some(mut agent) = self.agents.get(agent_pk).cloned() {
            if let Some(u) = agent.usage.iter_mut().find(|u| &u.asset == asset && u.day_bucket == day_bucket) {
                u.spent = U128(u.spent.0.saturating_add(amount));
            } else {
                agent.usage.push(crate::types::UsageCounter {
                    asset: asset.clone(),
                    day_bucket,
                    spent: U128(amount),
                });
            }
            self.agents.insert(agent_pk.to_string(), agent);
        }
    }

    pub(crate) fn revert_usage(&mut self, agent_pk: &str, asset: &Asset, amount: u128, day_bucket: u64) {
        if let Some(mut agent) = self.agents.get(agent_pk).cloned() {
            if let Some(u) = agent
                .usage
                .iter_mut()
                .find(|u| &u.asset == asset && u.day_bucket == day_bucket)
            {
                u.spent = U128(u.spent.0.saturating_sub(amount));
            }
            self.agents.insert(agent_pk.to_string(), agent);
        }
    }

    pub(crate) fn validate_input(&self, args: &PaymentArgs) -> Option<ReasonCode> {
        if args.amount.0 == 0
            || !valid_client_ref(&args.client_ref)
            || args.client_ref.len() > MAX_CLIENT_REF_LEN
            || !valid_memo(&args.memo)
            || args.memo.as_ref().map(|m| m.len()).unwrap_or(0) > MAX_MEMO_LEN
            || normalize_chain(&args.chain).is_none()
        {
            return Some(ReasonCode::InvalidInput);
        }
        let chain = normalize_chain(&args.chain).unwrap();
        if normalize_address(&chain, &args.address).is_none() {
            return Some(ReasonCode::InvalidInput);
        }
        None
    }

    fn find_limit<'a>(agent: &'a Agent, asset: &Asset) -> Option<&'a AssetLimit> {
        agent.policy.limits.iter().find(|l| l.asset == *asset)
    }

    fn find_payee(agent: &Agent, chain: &str, address: &str) -> Option<Payee> {
        let norm = normalize_address(chain, address).unwrap_or_else(|| address.to_string());
        agent.policy.payees.iter().find(|p| {
            let pc = normalize_chain(&p.chain).unwrap_or_else(|| p.chain.clone());
            let pa = normalize_address(&pc, &p.address).unwrap_or_else(|| p.address.clone());
            pc == chain && pa == norm
        }).cloned()
    }

    pub(crate) fn record_violation(&mut self, agent_pk: &str) {
        let hb = self.hour_bucket();
        if let Some(mut agent) = self.agents.get(agent_pk).cloned() {
            if agent.viol_hour_bucket != hb {
                agent.viol_hour_bucket = hb;
                agent.violations = 0;
            }
            agent.violations = agent.violations.saturating_add(1);
            let should_freeze = agent.policy.freeze_after_violations > 0
                && agent.violations >= agent.policy.freeze_after_violations;
            if should_freeze {
                agent.status = AgentStatus::Frozen;
            }
            self.agents.insert(agent_pk.to_string(), agent.clone());
            if should_freeze {
                events::emit_agent_auto_frozen(agent_pk, agent.violations);
            }
        }
    }

    fn reject(&mut self, req: PaymentRequest, reason: ReasonCode, count_violation: bool, agent_pk: &str, day_bucket: u64) -> Decision {
        let id = req.id;
        let mut req = req;
        req.status = RequestStatus::Rejected;
        req.reason = Some(reason);
        req.decided_ns = Some(env::block_timestamp());
        self.requests.insert(id, req);
        self.bump_change(id);
        if count_violation {
            self.record_violation(agent_pk);
        }
        let _ = day_bucket;
        events::emit_payment_rejected(id, &reason_str(reason));
        Decision::Rejected { request_id: id, reason }
    }

    pub(crate) fn request_payment_inner(&mut self, args: PaymentArgs) -> Decision {
        require!(
            env::predecessor_account_id() == env::current_account_id(),
            "request_payment must be called by the vault account via the agent key"
        );
        let signer_pk = env::signer_account_pk();
        let agent_pk = signer_pk.to_string();
        let mut agent = self
            .agents
            .get(&agent_pk).cloned()
            .unwrap_or_else(|| env::panic_str("unknown agent key"));

        let agent_pk_str = agent_pk.clone();
        let client_key = format!("{}|{}", agent_pk_str, args.client_ref);
        if let Some(existing_id) = self.client_refs.get(&client_key).copied() {
            if let Some(existing) = self.requests.get(&existing_id).cloned() {
                events::emit_payment_duplicate(existing_id);
                return Decision::Duplicate {
                    request_id: existing_id,
                    status: existing.status,
                };
            }
        }

        let hb = self.hour_bucket();
        let db = self.day_bucket();
        if agent.rate_hour_bucket != hb {
            agent.rate_hour_bucket = hb;
            agent.rate_count = 0;
        }
        agent.rate_count = agent.rate_count.saturating_add(1);
        self.agents.insert(agent_pk_str.clone(), agent.clone());

        let id = self.next_request_id;
        self.next_request_id = self.next_request_id.saturating_add(1);
        let chain_norm = normalize_chain(&args.chain).unwrap_or_else(|| args.chain.clone());
        let addr_norm = normalize_address(&chain_norm, &args.address).unwrap_or_else(|| args.address.clone());
        let mut req = PaymentRequest {
            id,
            agent_pk: signer_pk.clone(),
            client_ref: args.client_ref.clone(),
            asset: args.asset.clone(),
            amount: args.amount,
            chain: chain_norm.clone(),
            address: addr_norm,
            dest_asset: args.dest_asset.clone(),
            memo: args.memo.clone(),
            status: RequestStatus::Rejected,
            reason: None,
            created_ns: env::block_timestamp(),
            decided_ns: None,
            deposit_address: None,
            settlement_ref: None,
            last_change_seq: 0,
        };
        self.client_refs.insert(client_key, id);
        self.requests.insert(id, req.clone());
        self.bump_change(id);
        events::emit_payment_requested(id, &agent_pk_str, &args.client_ref);

        if self.paused {
            return self.reject(req, ReasonCode::VaultPaused, false, &agent_pk_str, db);
        }
        if agent.status != AgentStatus::Active {
            return self.reject(req, ReasonCode::AgentFrozen, false, &agent_pk_str, db);
        }
        if let Some(exp) = agent.policy.expires_at_ns {
            if env::block_timestamp() > exp {
                return self.reject(req, ReasonCode::PolicyExpired, true, &agent_pk_str, db);
            }
        }
        if let Some(r) = self.validate_input(&args) {
            return self.reject(req, r, true, &agent_pk_str, db);
        }
        let limit = match Self::find_limit(&agent, &args.asset) {
            Some(l) => l.clone(),
            None => return self.reject(req, ReasonCode::AssetNotAllowed, true, &agent_pk_str, db),
        };
        let payee = match Self::find_payee(&agent, &chain_norm, &args.address) {
            Some(p) => p,
            None => return self.reject(req, ReasonCode::PayeeNotAllowed, true, &agent_pk_str, db),
        };
        if !payee.allowed_dest_assets.is_empty() {
            let dest = args.dest_asset.clone().unwrap_or_default();
            if !payee.allowed_dest_assets.iter().any(|a| a == &dest) {
                return self.reject(req, ReasonCode::DestAssetNotAllowed, true, &agent_pk_str, db);
            }
        }
        if args.amount.0 > limit.per_tx_max.0 {
            return self.reject(req, ReasonCode::PerTxCapExceeded, true, &agent_pk_str, db);
        }
        if agent.rate_count > agent.policy.max_requests_per_hour {
            return self.reject(req, ReasonCode::RateLimitExceeded, true, &agent_pk_str, db);
        }
        let spent = self.spent_today(&agent, &args.asset, db);
        match spent.checked_add(args.amount.0) {
            Some(new_spent) if new_spent <= limit.daily_max.0 => {}
            _ => return self.reject(req, ReasonCode::DailyCapExceeded, true, &agent_pk_str, db),
        }
        if chain_norm == "near" {
            if matches!(args.asset, Asset::NEAR) && args.amount.0 > self.spendable() {
                return self.reject(req, ReasonCode::InsufficientBalance, false, &agent_pk_str, db);
            }
        }
        if let Some(threshold) = limit.cosign_above {
            if args.amount.0 > threshold.0 {
                req.status = RequestStatus::PendingApproval;
                req.decided_ns = Some(env::block_timestamp());
                self.requests.insert(id, req);
                self.bump_change(id);
                events::emit_payment_pending(id);
                return Decision::PendingApproval { request_id: id };
            }
        }
        // Step 13: approve.
        self.add_usage(&agent_pk_str, &args.asset, args.amount.0, db);
        req.decided_ns = Some(env::block_timestamp());
        if chain_norm == "near" {
            req.status = RequestStatus::Approved;
            self.requests.insert(id, req.clone());
            self.bump_change(id);
            events::emit_payment_approved(id);
            self.pay_same_chain(&req, &args);
            Decision::Approved { request_id: id }
        } else {
            req.status = RequestStatus::AwaitingExecution;
            self.requests.insert(id, req);
            self.bump_change(id);
            events::emit_payment_approved(id);
            Decision::Approved { request_id: id }
        }
    }

    pub(crate) fn pay_same_chain(&self, req: &PaymentRequest, args: &PaymentArgs) {
        match &args.asset {
            Asset::NEAR => {
                let payee = AccountId::new_unvalidated(req.address.clone());
                Promise::new(payee)
                    .transfer(NearToken::from_yoctonear(args.amount.0))
                    .then(
                        Promise::new(env::current_account_id()).function_call(
                            "on_payment_resolved".to_string(),
                            serde_json::to_vec(&json_request_id(req.id)).unwrap_or_default(),
                            NearToken::from_yoctonear(0),
                            near_sdk::Gas::from_tgas(50),
                        ),
                    );
            }
            Asset::FT(token) => {
                let payee = req.address.clone();
                Promise::new(token.clone())
                    .function_call(
                        "ft_transfer".to_string(),
                        serde_json::to_vec(&serde_json::json!({
                            "receiver_id": payee,
                            "amount": req.amount,
                            "memo": req.memo.clone().unwrap_or_default()
                        }))
                        .unwrap_or_default(),
                        NearToken::from_yoctonear(1),
                        near_sdk::Gas::from_tgas(50),
                    )
                    .then(
                        Promise::new(env::current_account_id()).function_call(
                            "on_payment_resolved".to_string(),
                            serde_json::to_vec(&json_request_id(req.id)).unwrap_or_default(),
                            NearToken::from_yoctonear(0),
                            near_sdk::Gas::from_tgas(50),
                        ),
                    );
            }
        }
    }

    pub fn add_agent_key_promise(pk: PublicKey, allowance_yocto: U128) -> Promise {
        Promise::new(env::current_account_id()).add_access_key_allowance(
            pk,
            Allowance::limited(NearToken::from_yoctonear(allowance_yocto.0)).unwrap(),
            env::current_account_id(),
            "request_payment",
        )
    }
}

pub fn reason_str(r: ReasonCode) -> &'static str {
    match r {
        ReasonCode::VaultPaused => "VAULT_PAUSED",
        ReasonCode::AgentFrozen => "AGENT_FROZEN",
        ReasonCode::PolicyExpired => "POLICY_EXPIRED",
        ReasonCode::InvalidInput => "INVALID_INPUT",
        ReasonCode::AssetNotAllowed => "ASSET_NOT_ALLOWED",
        ReasonCode::PayeeNotAllowed => "PAYEE_NOT_ALLOWED",
        ReasonCode::DestAssetNotAllowed => "DEST_ASSET_NOT_ALLOWED",
        ReasonCode::PerTxCapExceeded => "PER_TX_CAP_EXCEEDED",
        ReasonCode::RateLimitExceeded => "RATE_LIMIT_EXCEEDED",
        ReasonCode::DailyCapExceeded => "DAILY_CAP_EXCEEDED",
        ReasonCode::InsufficientBalance => "INSUFFICIENT_BALANCE",
        ReasonCode::TransferFailed => "TRANSFER_FAILED",
        ReasonCode::OwnerRejected => "OWNER_REJECTED",
        ReasonCode::ApprovalExpired => "APPROVAL_EXPIRED",
    }
}

pub fn json_request_id(id: u64) -> serde_json::Value {
    serde_json::json!({ "request_id": id })
}

pub fn now_is_within_execution_window(created_ns: u64) -> bool {
    env::block_timestamp().saturating_sub(created_ns) < EXECUTION_WINDOW_NS
}
