use near_sdk::near;

use near_sdk::json_types::U128;
use near_sdk::{AccountId, PublicKey};

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum Asset {
    NEAR,
    FT(AccountId),
}

impl Asset {
    pub fn from_str_or_nears(s: &str) -> Option<Asset> {
        if s == "NEAR" {
            Some(Asset::NEAR)
        } else if let Some(rest) = s.strip_prefix("ft:") {
            rest.parse::<AccountId>().ok().map(Asset::FT)
        } else {
            None
        }
    }
    pub fn to_str(&self) -> String {
        match self {
            Asset::NEAR => "NEAR".to_string(),
            Asset::FT(a) => format!("ft:{}", a),
        }
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Debug)]
pub struct AssetLimit {
    pub asset: Asset,
    pub per_tx_max: U128,
    pub daily_max: U128,
    pub cosign_above: Option<U128>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq)]
pub struct Payee {
    pub label: String,
    pub chain: String,
    pub address: String,
    pub allowed_dest_assets: Vec<String>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq)]
pub struct Policy {
    pub limits: Vec<AssetLimit>,
    pub payees: Vec<Payee>,
    pub max_requests_per_hour: u32,
    pub freeze_after_violations: u32,
    pub expires_at_ns: Option<u64>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum AgentStatus {
    Active,
    Frozen,
    Revoked,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq)]
pub struct UsageCounter {
    pub asset: Asset,
    pub day_bucket: u64,
    pub spent: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq)]
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

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct PaymentArgs {
    pub client_ref: String,
    pub asset: Asset,
    pub amount: U128,
    pub chain: String,
    pub address: String,
    pub dest_asset: Option<String>,
    pub memo: Option<String>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
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

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
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

#[near(serializers = [borsh, json])]
#[derive(Clone)]
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
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub enum Decision {
    Approved { request_id: u64 },
    PendingApproval { request_id: u64 },
    Rejected { request_id: u64, reason: ReasonCode },
    Duplicate { request_id: u64, status: RequestStatus },
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum CrosschainOutcome {
    Delivered,
    Refunded,
    Failed,
}
