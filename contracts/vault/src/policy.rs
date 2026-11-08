use near_sdk::AccountId;

pub const MAX_LIMITS: usize = 8;
pub const MAX_PAYEES: usize = 50;
pub const MAX_NAME_LEN: usize = 40;
pub const MAX_LABEL_LEN: usize = 40;
pub const MAX_CLIENT_REF_LEN: usize = 64;
pub const MAX_MEMO_LEN: usize = 140;
pub const MAX_CHAIN_LEN: usize = 16;
pub const MIN_CHAIN_LEN: usize = 2;
pub const MIN_QUERY_LIMIT: u64 = 1;
pub const MAX_QUERY_LIMIT: u64 = 100;
pub const APPROVAL_TTL_NS: u64 = 24 * 60 * 60 * 1_000_000_000;
pub const EXECUTION_WINDOW_NS: u64 = 15 * 60 * 1_000_000_000;
pub const HOUR_BUCKET_NS: u64 = 3_600 * 1_000_000_000;
pub const DAY_BUCKET_NS: u64 = 86_400 * 1_000_000_000;

pub fn normalize_chain(chain: &str) -> Option<String> {
    if chain.len() < MIN_CHAIN_LEN || chain.len() > MAX_CHAIN_LEN {
        return None;
    }
    let lower = chain.to_ascii_lowercase();
    if !lower.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return None;
    }
    Some(lower)
}

pub fn normalize_address(chain: &str, address: &str) -> Option<String> {
    if chain == "near" {
        let lower = address.to_ascii_lowercase();
        if lower.parse::<AccountId>().is_err() {
            return None;
        }
        Some(lower)
    } else if address.len() == 42 && address.starts_with("0x") {
        let lower = address.to_ascii_lowercase();
        if !lower[2..].chars().all(|c| c.is_ascii_hexdigit()) {
            return None;
        }
        Some(lower)
    } else if address.is_empty() {
        None
    } else {
        Some(address.to_string())
    }
}

pub fn valid_client_ref(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= MAX_CLIENT_REF_LEN
        && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

pub fn valid_memo(m: &Option<String>) -> bool {
    match m {
        None => true,
        Some(s) => s.len() <= MAX_MEMO_LEN,
    }
}
