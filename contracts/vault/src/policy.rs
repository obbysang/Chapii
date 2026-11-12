use crate::types::*;
use near_sdk::AccountId;

pub const MAX_LIMITS: usize = 8;
pub const MAX_PAYEES: usize = 50;
pub const MAX_LABEL: usize = 40;
pub const MAX_MEMO: usize = 140;
pub const MAX_CLIENT_REF: usize = 64;
pub const HOUR_NS: u64 = 3_600_000_000_000;
pub const DAY_NS: u64 = 86_400_000_000_000;

#[derive(Clone, Debug)]
pub struct NormalizedArgs {
    pub asset: Asset,
    pub amount: u128,
    pub chain: String,
    pub address: String,
    pub dest_asset: Option<String>,
    pub memo: Option<String>,
}

pub fn normalize_chain(raw: &str) -> Option<String> {
    let chain = raw.trim().to_ascii_lowercase();
    if chain.len() < 2 || chain.len() > 16 {
        return None;
    }
    if !chain
        .bytes()
        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
    {
        return None;
    }
    Some(chain)
}

pub fn is_evm_address(raw: &str) -> bool {
    raw.len() == 42
        && raw.starts_with("0x")
        && raw[2..].bytes().all(|b| b.is_ascii_hexdigit())
}

/// Returns the canonical comparison form of an address for a chain, or None.
pub fn normalize_address(chain: &str, raw: &str) -> Option<String> {
    let raw = raw.trim();
    if raw.is_empty() || raw.len() > 128 {
        return None;
    }
    if chain == "near" {
        let lower = raw.to_ascii_lowercase();
        let id = AccountId::try_from(lower).ok()?;
        return Some(id.to_string());
    }
    if is_evm_address(raw) {
        return Some(raw.to_ascii_lowercase());
    }
    // Base58 (Solana), bech32 and other opaque identifiers: compare exactly.
    if raw
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || b == b':' || b == b'.' || b == b'_' || b == b'-')
    {
        return Some(raw.to_string());
    }
    None
}

pub fn valid_client_ref(raw: &str) -> bool {
    !raw.is_empty()
        && raw.chars().count() <= MAX_CLIENT_REF
        && raw
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

pub fn normalize_args(args: &PaymentArgs) -> Option<NormalizedArgs> {
    let chain = normalize_chain(&args.chain)?;
    let address = normalize_address(&chain, &args.address)?;
    let memo = args.memo.clone();
    if let Some(m) = &memo {
        if m.chars().count() > MAX_MEMO {
            return None;
        }
    }
    let dest_asset = args.dest_asset.as_ref().map(|d| d.trim().to_string());
    if let Some(d) = &dest_asset {
        if d.is_empty() || d.len() > 64 {
            return None;
        }
    }
    Some(NormalizedArgs {
        asset: args.asset.clone(),
        amount: args.amount.0,
        chain,
        address,
        dest_asset,
        memo,
    })
}

pub fn validate_policy(policy: &Policy) -> Result<(), String> {
    if policy.limits.is_empty() || policy.limits.len() > MAX_LIMITS {
        return Err(format!("limits must contain 1..={} entries", MAX_LIMITS));
    }
    let mut seen: Vec<&Asset> = Vec::new();
    for limit in &policy.limits {
        if seen.contains(&&limit.asset) {
            return Err("duplicate asset in limits".to_string());
        }
        seen.push(&limit.asset);
        if limit.per_tx_max.0 == 0 {
            return Err("per_tx_max must be > 0".to_string());
        }
        if limit.daily_max.0 < limit.per_tx_max.0 {
            return Err("daily_max must be >= per_tx_max".to_string());
        }
        if let Some(cosign) = limit.cosign_above {
            if cosign.0 > limit.per_tx_max.0 {
                return Err("cosign_above must be <= per_tx_max".to_string());
            }
        }
    }
    if policy.payees.len() > MAX_PAYEES {
        return Err(format!("at most {} payees", MAX_PAYEES));
    }
    for payee in &policy.payees {
        if payee.label.chars().count() > MAX_LABEL {
            return Err("payee label too long".to_string());
        }
        let chain = normalize_chain(&payee.chain).ok_or("invalid payee chain")?;
        if normalize_address(&chain, &payee.address).is_none() {
            return Err(format!("invalid payee address for chain {}", chain));
        }
        if payee.allowed_dest_assets.len() > 20 {
            return Err("at most 20 allowed destination assets".to_string());
        }
        for asset in &payee.allowed_dest_assets {
            if asset.is_empty() || asset.len() > 64 {
                return Err("invalid destination asset".to_string());
            }
        }
    }
    if policy.max_requests_per_hour < 1 || policy.max_requests_per_hour > 200 {
        return Err("max_requests_per_hour must be 1..=200".to_string());
    }
    if policy.freeze_after_violations > 20 {
        return Err("freeze_after_violations must be <= 20".to_string());
    }
    Ok(())
}

/// Canonicalize a policy so the contract stores the exact forms it compares.
pub fn canonicalize_policy(policy: &Policy) -> Policy {
    let mut p = policy.clone();
    for payee in &mut p.payees {
        if let Some(chain) = normalize_chain(&payee.chain) {
            if let Some(address) = normalize_address(&chain, &payee.address) {
                payee.chain = chain;
                payee.address = address;
            }
        }
    }
    p
}

pub struct EvalInput<'a> {
    pub paused: bool,
    pub agent: &'a mut Agent,
    pub normalized: Option<&'a NormalizedArgs>,
    pub now: u64,
    pub day_bucket: u64,
    pub hour_bucket: u64,
    pub balance: u128,
    pub storage_reserve: u128,
}

pub struct EvalOutcome {
    pub status: RequestStatus,
    pub reason: Option<ReasonCode>,
    /// True when the failure is a policy violation that counts toward auto-freeze.
    pub violation: bool,
}

fn reject(reason: ReasonCode, violation: bool) -> EvalOutcome {
    EvalOutcome {
        status: RequestStatus::Rejected,
        reason: Some(reason),
        violation,
    }
}

/// Deterministic policy evaluation. Order is part of the public contract;
/// the red-team harness asserts on it.
pub fn evaluate(input: EvalInput<'_>) -> EvalOutcome {
    let EvalInput {
        paused,
        agent,
        normalized,
        now,
        day_bucket,
        hour_bucket,
        balance,
        storage_reserve,
    } = input;

    if paused {
        return reject(ReasonCode::VaultPaused, false);
    }
    if agent.status != AgentStatus::Active {
        return reject(ReasonCode::AgentFrozen, false);
    }
    if let Some(expires) = agent.policy.expires_at_ns {
        if now >= expires {
            return reject(ReasonCode::PolicyExpired, true);
        }
    }
    let normalized = match normalized {
        Some(n) if n.amount > 0 => n,
        _ => return reject(ReasonCode::InvalidInput, true),
    };
    let limit = match agent.policy.limit_for(&normalized.asset) {
        Some(l) => l.clone(),
        None => return reject(ReasonCode::AssetNotAllowed, true),
    };
    let payee = match agent
        .policy
        .payees
        .iter()
        .find(|p| p.chain == normalized.chain && p.address == normalized.address)
    {
        Some(p) => p.clone(),
        None => return reject(ReasonCode::PayeeNotAllowed, true),
    };
    if !payee.allowed_dest_assets.is_empty() {
        let ok = normalized
            .dest_asset
            .as_ref()
            .map(|d| payee.allowed_dest_assets.iter().any(|a| a == d))
            .unwrap_or(false);
        if !ok {
            return reject(ReasonCode::DestAssetNotAllowed, true);
        }
    }
    if normalized.amount > limit.per_tx_max.0 {
        return reject(ReasonCode::PerTxCapExceeded, true);
    }
    if agent.rate_hour_bucket == hour_bucket
        && agent.rate_count > agent.policy.max_requests_per_hour
    {
        return reject(ReasonCode::RateLimitExceeded, true);
    }
    let spent = agent.spent_in_bucket(&normalized.asset, day_bucket);
    let new_spent = match spent.checked_add(normalized.amount) {
        Some(v) => v,
        None => return reject(ReasonCode::DailyCapExceeded, true),
    };
    if new_spent > limit.daily_max.0 {
        return reject(ReasonCode::DailyCapExceeded, true);
    }
    if normalized.chain == "near"
        && normalized.asset == Asset::Near
        && normalized.amount > balance.saturating_sub(storage_reserve)
    {
        return reject(ReasonCode::InsufficientBalance, false);
    }
    if let Some(cosign_above) = limit.cosign_above {
        if normalized.amount > cosign_above.0 {
            return EvalOutcome {
                status: RequestStatus::PendingApproval,
                reason: None,
                violation: false,
            };
        }
    }

    // Approval reserves the daily budget immediately. Cross-chain payouts wait
    // for the executor and are funded from a NEP-141 token.
    let status = if normalized.chain == "near" {
        RequestStatus::Approved
    } else {
        RequestStatus::AwaitingExecution
    };
    EvalOutcome {
        status,
        reason: None,
        violation: false,
    }
}

/// Extra checks run when the owner approves a previously pending request.
pub fn evaluate_approval(
    paused: bool,
    agent: &mut Agent,
    request: &PaymentRequest,
    now: u64,
    day_bucket: u64,
    balance: u128,
    storage_reserve: u128,
) -> EvalOutcome {
    if paused {
        return reject(ReasonCode::VaultPaused, false);
    }
    if agent.status != AgentStatus::Active {
        return reject(ReasonCode::AgentFrozen, false);
    }
    if let Some(expires) = agent.policy.expires_at_ns {
        if now >= expires {
            return reject(ReasonCode::PolicyExpired, true);
        }
    }
    let limit = match agent.policy.limit_for(&request.asset) {
        Some(l) => l.clone(),
        None => return reject(ReasonCode::AssetNotAllowed, true),
    };
    let payee = match agent
        .policy
        .payees
        .iter()
        .find(|p| p.chain == request.chain && p.address == request.address)
    {
        Some(p) => p.clone(),
        None => return reject(ReasonCode::PayeeNotAllowed, true),
    };
    if !payee.allowed_dest_assets.is_empty() {
        let ok = request
            .dest_asset
            .as_ref()
            .map(|d| payee.allowed_dest_assets.iter().any(|a| a == d))
            .unwrap_or(false);
        if !ok {
            return reject(ReasonCode::DestAssetNotAllowed, true);
        }
    }
    if request.amount.0 > limit.per_tx_max.0 {
        return reject(ReasonCode::PerTxCapExceeded, true);
    }
    let spent = agent.spent_in_bucket(&request.asset, day_bucket);
    let new_spent = match spent.checked_add(request.amount.0) {
        Some(v) => v,
        None => return reject(ReasonCode::DailyCapExceeded, true),
    };
    if new_spent > limit.daily_max.0 {
        return reject(ReasonCode::DailyCapExceeded, true);
    }
    if request.chain == "near"
        && request.asset == Asset::Near
        && request.amount.0 > balance.saturating_sub(storage_reserve)
    {
        return reject(ReasonCode::InsufficientBalance, false);
    }
    let status = if request.chain == "near" {
        RequestStatus::Approved
    } else {
        RequestStatus::AwaitingExecution
    };
    EvalOutcome {
        status,
        reason: None,
        violation: false,
    }
}

/// Approval used for pending requests does not re-run the rate limit: the
/// request already consumed a rate slot when it was first submitted.
pub fn bump_rate(agent: &mut Agent, hour_bucket: u64) {
    if agent.rate_hour_bucket != hour_bucket {
        agent.rate_hour_bucket = hour_bucket;
        agent.rate_count = 0;
    }
    agent.rate_count = agent.rate_count.saturating_add(1);
}

pub fn bump_violation(agent: &mut Agent, hour_bucket: u64) -> bool {
    if agent.viol_hour_bucket != hour_bucket {
        agent.viol_hour_bucket = hour_bucket;
        agent.violations = 0;
    }
    agent.violations = agent.violations.saturating_add(1);
    agent.policy.freeze_after_violations > 0
        && agent.violations >= agent.policy.freeze_after_violations
}
