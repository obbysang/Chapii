use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Deserializer, Serialize, Serializer};
use near_sdk::{AccountId, PublicKey};

// ---------------------------------------------------------------------------
// Asset
// ---------------------------------------------------------------------------

/// An asset the vault can hold. JSON representation: "NEAR" | "ft:<account_id>".
#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum Asset {
    Near,
    Ft(AccountId),
}

impl Asset {
    pub fn parse(raw: &str) -> Option<Self> {
        if raw == "NEAR" {
            return Some(Asset::Near);
        }
        let id = raw.strip_prefix("ft:")?;
        AccountId::try_from(id.to_string()).ok().map(Asset::Ft)
    }

    pub fn key(&self) -> String {
        match self {
            Asset::Near => "NEAR".to_string(),
            Asset::Ft(id) => format!("ft:{}", id),
        }
    }
}

impl Serialize for Asset {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.key())
    }
}

impl<'de> Deserialize<'de> for Asset {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let raw = String::deserialize(deserializer)?;
        Asset::parse(&raw).ok_or_else(|| {
            near_sdk::serde::de::Error::custom("asset must be \"NEAR\" or \"ft:<account_id>\"")
        })
    }
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct AssetLimit {
    pub asset: Asset,
    /// Smallest units, as a decimal string in JSON.
    pub per_tx_max: U128,
    pub daily_max: U128,
    /// None = never require owner co-sign.
    pub cosign_above: Option<U128>,
}

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct Payee {
    pub label: String,
    pub chain: String,
    pub address: String,
    /// Empty = any destination asset. Intents asset ids/symbols otherwise.
    pub allowed_dest_assets: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct Policy {
    pub limits: Vec<AssetLimit>,
    pub payees: Vec<Payee>,
    pub max_requests_per_hour: u32,
    /// 0 disables the circuit breaker. Default 3.
    pub freeze_after_violations: u32,
    pub expires_at_ns: Option<u64>,
}

impl Policy {
    pub fn limit_for(&self, asset: &Asset) -> Option<&AssetLimit> {
        self.limits.iter().find(|l| &l.asset == asset)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AgentStatus {
    Active,
    Frozen,
    Revoked,
}

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct UsageCounter {
    pub asset: Asset,
    pub day_bucket: u64,
    pub spent: U128,
}

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct Agent {
    pub name: String,
    pub status: AgentStatus,
    pub policy: Policy,
    pub created_at_ns: u64,
    pub usage: Vec<UsageCounter>,
    pub rate_hour_bucket: u64,
    pub rate_count: u32,
    pub viol_hour_bucket: u64,
    pub violations: u32,
}

impl Agent {
    pub fn spent_in_bucket(&self, asset: &Asset, bucket: u64) -> u128 {
        self.usage
            .iter()
            .find(|u| &u.asset == asset && u.day_bucket == bucket)
            .map(|u| u.spent.0)
            .unwrap_or(0)
    }

    pub fn set_spent(&mut self, asset: &Asset, bucket: u64, value: u128) {
        if let Some(counter) = self
            .usage
            .iter_mut()
            .find(|u| &u.asset == asset && u.day_bucket == bucket)
        {
            counter.spent = U128(value);
        } else {
            self.usage.retain(|u| &u.asset != asset);
            self.usage.push(UsageCounter {
                asset: asset.clone(),
                day_bucket: bucket,
                spent: U128(value),
            });
        }
    }
}

// ---------------------------------------------------------------------------
// Payment request
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PaymentArgs {
    pub client_ref: String,
    pub asset: Asset,
    pub amount: U128,
    pub chain: String,
    pub address: String,
    pub dest_asset: Option<String>,
    pub memo: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReasonCode {
    VaultPaused,
    AgentFrozen,
    PolicyExpired,
    InvalidInput,
    AssetNotAllowed,
    PayeeNotAllowed,
    DestAssetNotAllowed,
    PerTxCapExceeded,
    RateLimitExceeded,
    DailyCapExceeded,
    InsufficientBalance,
    TransferFailed,
    OwnerRejected,
    ApprovalExpired,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RequestStatus {
    Rejected,
    PendingApproval,
    Approved,
    AwaitingExecution,
    Executing,
    Completed,
    Failed,
    RejectedByOwner,
    Expired,
}

impl RequestStatus {
    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            RequestStatus::Rejected
                | RequestStatus::Completed
                | RequestStatus::Failed
                | RequestStatus::RejectedByOwner
                | RequestStatus::Expired
        )
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct PaymentRequest {
    pub id: u64,
    pub agent_pk: PublicKey,
    pub client_ref: String,
    pub asset: Asset,
    pub amount: U128,
    pub chain: String,
    pub address: String,
    pub dest_asset: Option<String>,
    pub memo: Option<String>,
    pub status: RequestStatus,
    pub reason: Option<ReasonCode>,
    pub created_ns: u64,
    pub decided_ns: Option<u64>,
    pub deposit_address: Option<String>,
    pub settlement_ref: Option<String>,
    pub last_change_seq: u64,
    /// Day bucket that reserved this request's amount (for rollback).
    pub usage_day_bucket: u64,
}

/// Adjacently tagged so agents get an easy, stable machine-readable result:
/// {"decision":"APPROVED","data":{"request_id":7}}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "decision", content = "data", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Decision {
    Approved { request_id: u64 },
    PendingApproval { request_id: u64 },
    Rejected { request_id: u64, reason: ReasonCode },
    Duplicate { request_id: u64, status: RequestStatus },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CrosschainOutcome {
    Delivered,
    Refunded,
    Failed,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentView {
    pub public_key: PublicKey,
    pub agent: Agent,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BudgetEntry {
    pub asset: Asset,
    pub daily_max: U128,
    pub spent_today: U128,
    pub remaining: U128,
    pub per_tx_max: U128,
    pub cosign_above: Option<U128>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Budget {
    pub per_asset: Vec<BudgetEntry>,
    pub rate_remaining: u32,
    pub violations: u32,
    pub status: AgentStatus,
    pub expires_at_ns: Option<u64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChangesPage {
    pub requests: Vec<PaymentRequest>,
    pub latest_seq: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StorageInfo {
    pub balance: U128,
    pub storage_reserve: U128,
    pub spendable: U128,
}
