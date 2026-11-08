mod agent;
mod callbacks;
#[cfg(test)]
mod tests;
mod events;
mod executor;
mod owner;
mod policy;
mod types;
mod views;

use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{env, near, AccountId, PanicOnDefault};

use crate::types::{Agent, PaymentRequest};

pub use crate::types::{
    AgentStatus, Asset, AssetLimit, CrosschainOutcome, Decision, Payee, PaymentArgs, Policy,
    ReasonCode, RequestStatus,
};

const STORAGE_RESERVE_YOCTO: u128 = 100_000_000_000_000_000_000_000;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Vault {
    pub owner_id: AccountId,
    pub executor_id: Option<AccountId>,
    pub paused: bool,
    pub agents: IterableMap<String, Agent>,
    pub requests: IterableMap<u64, PaymentRequest>,
    pub client_refs: LookupMap<String, u64>,
    pub next_request_id: u64,
    pub change_seq: u64,
    pub change_log: IterableMap<u64, u64>,
}

impl Vault {
    pub fn new_vault(owner_id: AccountId) -> Self {
        Self {
            owner_id,
            executor_id: None,
            paused: false,
            agents: IterableMap::new(b"agents".to_vec()),
            requests: IterableMap::new(b"requests".to_vec()),
            client_refs: LookupMap::new(b"client_refs".to_vec()),
            next_request_id: 0,
            change_seq: 0,
            change_log: IterableMap::new(b"change_log".to_vec()),
        }
    }

    pub fn hour_bucket(&self) -> u64 {
        env::block_timestamp() / crate::policy::HOUR_BUCKET_NS
    }

    pub fn day_bucket(&self) -> u64 {
        env::block_timestamp() / crate::policy::DAY_BUCKET_NS
    }

    pub fn storage_reserve(&self) -> u128 {
        STORAGE_RESERVE_YOCTO
    }

    pub fn spendable(&self) -> u128 {
        let balance: u128 = env::account_balance().as_yoctonear();
        balance.saturating_sub(self.storage_reserve())
    }

    pub fn day_bucket_at(&self, ts_ns: u64) -> u64 {
        ts_ns / crate::policy::DAY_BUCKET_NS
    }

    pub fn bump_change(&mut self, request_id: u64) {
        self.change_seq = self.change_seq.saturating_add(1);
        let seq = self.change_seq;
        self.change_log.insert(seq, request_id);
        if let Some(mut req) = self.requests.get(&request_id).cloned() {
            req.last_change_seq = seq;
            self.requests.insert(request_id, req);
        }
    }
}

#[near]
impl Vault {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self::new_vault(owner_id)
    }

    // Agent
    pub fn request_payment(&mut self, args: crate::types::PaymentArgs) -> crate::types::Decision {
        self.request_payment_inner(args)
    }

    // Owner
    pub fn add_agent(
        &mut self,
        public_key: near_sdk::PublicKey,
        name: String,
        policy: crate::types::Policy,
        allowance_yocto: near_sdk::json_types::U128,
    ) -> near_sdk::Promise {
        self.add_agent_inner(public_key, name, policy, allowance_yocto)
    }
    pub fn update_policy(&mut self, public_key: near_sdk::PublicKey, policy: crate::types::Policy) {
        self.update_policy_inner(public_key, policy)
    }
    pub fn set_allowance(
        &mut self,
        public_key: near_sdk::PublicKey,
        allowance_yocto: near_sdk::json_types::U128,
    ) -> near_sdk::Promise {
        self.set_allowance_inner(public_key, allowance_yocto)
    }
    pub fn freeze_agent(&mut self, public_key: near_sdk::PublicKey) {
        self.freeze_agent_inner(public_key)
    }
    pub fn unfreeze_agent(&mut self, public_key: near_sdk::PublicKey) {
        self.unfreeze_agent_inner(public_key)
    }
    pub fn revoke_agent(&mut self, public_key: near_sdk::PublicKey) -> near_sdk::Promise {
        self.revoke_agent_inner(public_key)
    }
    pub fn pause(&mut self) {
        self.pause_inner()
    }
    pub fn unpause(&mut self) {
        self.unpause_inner()
    }
    pub fn approve_request(&mut self, request_id: u64) -> bool {
        self.approve_request_inner(request_id)
    }
    pub fn reject_request(&mut self, request_id: u64) {
        self.reject_request_inner(request_id)
    }
    pub fn set_executor(&mut self, account_id: Option<AccountId>) {
        self.set_executor_inner(account_id)
    }
    pub fn withdraw_near(
        &mut self,
        amount: near_sdk::json_types::U128,
        to: AccountId,
    ) -> near_sdk::Promise {
        self.withdraw_near_inner(amount, to)
    }
    pub fn withdraw_ft(
        &mut self,
        token: AccountId,
        amount: near_sdk::json_types::U128,
        to: AccountId,
    ) -> near_sdk::Promise {
        self.withdraw_ft_inner(token, amount, to)
    }
    pub fn prune_requests(&mut self, up_to_id: u64, limit: u64) -> u64 {
        self.prune_requests_inner(up_to_id, limit)
    }

    // Executor
    pub fn execute_crosschain(&mut self, request_id: u64, deposit_address: String) -> near_sdk::Promise {
        self.execute_crosschain_inner(request_id, deposit_address)
    }
    pub fn report_crosschain_result(
        &mut self,
        request_id: u64,
        outcome: crate::types::CrosschainOutcome,
        settlement_ref: String,
    ) {
        self.report_crosschain_result_inner(request_id, outcome, settlement_ref)
    }

    // Callbacks
    #[private]
    pub fn on_payment_resolved(&mut self, request_id: u64) {
        self.on_payment_resolved_inner(request_id)
    }
    #[private]
    pub fn on_crosschain_funded(&mut self, request_id: u64) {
        self.on_crosschain_funded_inner(request_id)
    }

    // Views
    pub fn get_owner(&self) -> AccountId {
        self.get_owner_inner()
    }
    pub fn get_executor(&self) -> Option<AccountId> {
        self.get_executor_inner()
    }
    pub fn is_paused(&self) -> bool {
        self.is_paused_inner()
    }
    pub fn get_agents(&self, from_index: u64, limit: u64) -> Vec<(String, crate::types::Agent)> {
        self.get_agents_inner(from_index, limit)
    }
    pub fn get_agent(&self, public_key: near_sdk::PublicKey) -> Option<crate::types::Agent> {
        self.get_agent_inner(public_key)
    }
    pub fn get_budget(&self, public_key: near_sdk::PublicKey) -> Option<crate::views::Budget> {
        self.get_budget_inner(public_key)
    }
    pub fn get_request(&self, id: u64) -> Option<crate::types::PaymentRequest> {
        self.get_request_inner(id)
    }
    pub fn get_requests(&self, from_id: u64, limit: u64, reverse: bool) -> Vec<crate::types::PaymentRequest> {
        self.get_requests_inner(from_id, limit, reverse)
    }
    pub fn get_pending_requests(&self) -> Vec<crate::types::PaymentRequest> {
        self.get_pending_requests_inner()
    }
    pub fn get_changes_since(&self, seq: u64, limit: u64) -> crate::views::ChangesResult {
        self.get_changes_since_inner(seq, limit)
    }
    pub fn get_storage_info(&self) -> crate::views::StorageInfo {
        self.get_storage_info_inner()
    }
    pub fn get_chain_snapshot(&self) -> u64 {
        self.get_chain_snapshot_inner()
    }
}
