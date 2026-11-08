use crate::types::{Agent, PaymentRequest, RequestStatus};
use near_sdk::near;
use crate::Vault;
use near_sdk::json_types::U128;
use near_sdk::{env, AccountId, PublicKey};

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct BudgetAsset {
    pub asset: crate::types::Asset,
    pub daily_max: U128,
    pub spent_today: U128,
    pub remaining: U128,
    pub per_tx_max: U128,
    pub cosign_above: Option<U128>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Budget {
    pub per_asset: Vec<BudgetAsset>,
    pub rate_remaining: u32,
    pub violations: u32,
    pub status: crate::types::AgentStatus,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct StorageInfo {
    pub balance: U128,
    pub storage_reserve: U128,
    pub spendable: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct ChangesResult {
    pub requests: Vec<PaymentRequest>,
    pub latest_seq: u64,
}

impl Vault {
    fn clamp(limit: u64) -> u64 {
        if limit == 0 {
            return crate::policy::MIN_QUERY_LIMIT;
        }
        limit.min(crate::policy::MAX_QUERY_LIMIT)
    }
}

impl Vault {
    pub(crate) fn get_owner_inner(&self) -> AccountId {
        self.owner_id.clone()
    }

    pub(crate) fn get_executor_inner(&self) -> Option<AccountId> {
        self.executor_id.clone()
    }

    pub(crate) fn is_paused_inner(&self) -> bool {
        self.paused
    }

    pub(crate) fn get_agents_inner(&self, from_index: u64, limit: u64) -> Vec<(String, Agent)> {
        let limit = Self::clamp(limit) as usize;
        self.agents
            .iter()
            .skip(from_index as usize)
            .take(limit)
            .map(|(k, v)| (k.to_string(), v.clone()))
            .collect()
    }

    pub(crate) fn get_agent_inner(&self, public_key: PublicKey) -> Option<Agent> {
        self.agents.get(&public_key.to_string()).cloned()
    }

    pub(crate) fn get_budget_inner(&self, public_key: PublicKey) -> Option<Budget> {
        let agent = self.agents.get(&public_key.to_string()).cloned()?;
        let db = self.day_bucket();
        let per_asset: Vec<BudgetAsset> = agent
            .policy
            .limits
            .iter()
            .map(|l| {
                let spent = self.spent_today(&agent, &l.asset, db);
                BudgetAsset {
                    asset: l.asset.clone(),
                    daily_max: l.daily_max,
                    spent_today: U128(spent),
                    remaining: U128(l.daily_max.0.saturating_sub(spent)),
                    per_tx_max: l.per_tx_max,
                    cosign_above: l.cosign_above,
                }
            })
            .collect();
        let hb = self.hour_bucket();
        let rate_used = if agent.rate_hour_bucket == hb { agent.rate_count } else { 0 };
        let rate_remaining = agent.policy.max_requests_per_hour.saturating_sub(rate_used);
        Some(Budget {
            per_asset,
            rate_remaining,
            violations: agent.violations,
            status: agent.status,
        })
    }

    pub(crate) fn get_request_inner(&self, id: u64) -> Option<PaymentRequest> {
        self.requests.get(&id).cloned()
    }

    pub(crate) fn get_requests_inner(&self, from_id: u64, limit: u64, reverse: bool) -> Vec<PaymentRequest> {
        let limit = Self::clamp(limit) as usize;
        let mut ids: Vec<u64> = self
            .requests
            .iter()
            .map(|(k, _)| *k)
            .filter(|k| *k >= from_id)
            .collect();
        ids.sort();
        if reverse {
            ids.reverse();
        }
        ids.into_iter()
            .take(limit)
            .filter_map(|id| self.requests.get(&id).cloned())
            .collect()
    }

    pub(crate) fn get_pending_requests_inner(&self) -> Vec<PaymentRequest> {
        self.requests
            .iter()
            .filter(|(_, r)| r.status == RequestStatus::PendingApproval)
            .map(|(_, r)| r.clone())
            .collect()
    }

    pub(crate) fn get_changes_since_inner(&self, seq: u64, limit: u64) -> ChangesResult {
        let limit = Self::clamp(limit) as usize;
        let mut entries: Vec<(u64, u64)> = self
            .change_log
            .iter()
            .filter(|(k, _)| **k > seq)
            .map(|(k, v)| (*k, *v))
            .collect();
        entries.sort_by_key(|(seq, _)| *seq);
        let requests: Vec<PaymentRequest> = entries
            .into_iter()
            .take(limit)
            .filter_map(|(_, req_id)| self.requests.get(&req_id).cloned())
            .collect();
        ChangesResult {
            requests,
            latest_seq: self.change_seq,
        }
    }

    pub(crate) fn get_storage_info_inner(&self) -> StorageInfo {
        let balance: u128 = env::account_balance().as_yoctonear();
        let reserve = self.storage_reserve();
        StorageInfo {
            balance: U128(balance),
            storage_reserve: U128(reserve),
            spendable: U128(balance.saturating_sub(reserve)),
        }
    }

    pub(crate) fn get_chain_snapshot_inner(&self) -> u64 {
        self.change_seq
    }
}
