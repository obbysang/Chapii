use near_sdk::json_types::U128;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{AccountId, NearToken, PublicKey};
use crate::types::*;
use crate::Vault;

pub fn ctx() -> VMContextBuilder {
    let mut b = VMContextBuilder::new();
    b.current_account_id("vault.testnet".parse().unwrap())
        .signer_account_id("vault.testnet".parse().unwrap())
        .predecessor_account_id("vault.testnet".parse().unwrap());
    b
}

pub fn agent_pk() -> PublicKey {
    "ed25519:G2AoStHM93miZpJrT8GSytq6qqmxf8jQMRi2aNa5iE4T".parse().unwrap()
}

pub fn owner_pk() -> PublicKey {
    "ed25519:2BkbSW2KAPz12UsDP2AmsgxXuL1eqrSUNngz1CNPLH8T".parse().unwrap()
}

pub fn setup() -> Vault {
    let owner: AccountId = "owner.testnet".parse().unwrap();
    let mut v = Vault::new_vault(owner);
    let policy = Policy {
        limits: vec![AssetLimit {
            asset: Asset::NEAR,
            per_tx_max: U128(15_000_000_000_000_000_000_000_000),
            daily_max: U128(20_000_000_000_000_000_000_000_000),
            cosign_above: Some(U128(10_000_000_000_000_000_000_000_000)),
        }],
        payees: vec![Payee {
            label: "Supplier".to_string(),
            chain: "near".to_string(),
            address: "alice.testnet".to_string(),
            allowed_dest_assets: vec![],
        }],
        max_requests_per_hour: 10,
        freeze_after_violations: 3,
        expires_at_ns: None,
    };
    // add agent as owner
    let mut c = ctx();
    c.predecessor_account_id("owner.testnet".parse().unwrap());
    near_sdk::testing_env!(c.build());
    // call inner with owner context
    v.add_agent_inner(agent_pk(), "agent1".to_string(), policy, U128(1_000_000_000_000_000_000_000_000));
    v
}

pub fn args(client_ref: &str, amount: u128) -> PaymentArgs {
    PaymentArgs {
        client_ref: client_ref.to_string(),
        asset: Asset::NEAR,
        amount: U128(amount),
        chain: "near".to_string(),
        address: "alice.testnet".to_string(),
        dest_asset: Some("NEAR".to_string()),
        memo: Some("invoice".to_string()),
    }
}

pub fn as_agent(v: &mut Vault, a: &PaymentArgs) -> Decision {
    let mut c = ctx();
    c.signer_account_id("vault.testnet".parse().unwrap());
    c.predecessor_account_id("vault.testnet".parse().unwrap());
    c.signer_account_pk(agent_pk());
    c.block_timestamp(10_000_000_000_000);
    near_sdk::testing_env!(c.build());
    v.request_payment_inner(a.clone())
}

#[test]
fn payee_not_allowed() {
    let mut v = setup();
    let mut a = args("r1", 1);
    a.address = "attacker.testnet".to_string();
    match as_agent(&mut v, &a) {
        Decision::Rejected { reason, .. } => assert_eq!(reason, ReasonCode::PayeeNotAllowed),
        d => panic!("expected reject, got {:?}", d),
    }
}

#[test]
fn payee_one_char_changed() {
    let mut v = setup();
    let mut a = args("r1", 1);
    a.address = "alice.testnt".to_string();
    match as_agent(&mut v, &a) {
        Decision::Rejected { reason, .. } => assert_eq!(reason, ReasonCode::PayeeNotAllowed),
        d => panic!("expected reject got {:?}", d),
    }
}

#[test]
fn payee_wrong_chain() {
    let mut v = setup();
    let mut a = args("r1", 1);
    a.chain = "base".to_string();
    match as_agent(&mut v, &a) {
        Decision::Rejected { reason, .. } => assert_eq!(reason, ReasonCode::PayeeNotAllowed),
        d => panic!("expected reject got {:?}", d),
    }
}

#[test]
fn per_tx_cap_plus_one_fails() {
    let mut v = setup();
    let a = args("r1", 15_000_000_000_000_000_000_000_001);
    match as_agent(&mut v, &a) {
        Decision::Rejected { reason, .. } => assert_eq!(reason, ReasonCode::PerTxCapExceeded),
        d => panic!("expected reject got {:?}", d),
    }
}

#[test]
fn per_tx_cap_exact_passes() {
    let mut v = setup();
    let mut agent = v.agents.get(&agent_pk().to_string()).cloned().unwrap();
    agent.policy.limits[0].cosign_above = None;
    v.agents.insert(agent_pk().to_string(), agent);
    let a = args("r1", 15_000_000_000_000_000_000_000_000);
    match as_agent(&mut v, &a) {
        Decision::Approved { .. } => {}
        d => panic!("expected approve got {:?}", d),
    }
}

#[test]
fn salami_daily_cap() {
    let mut v = setup();
    for i in 0..2 {
        let a = args(&format!("s{}", i), 9_000_000_000_000_000_000_000_000);
        match as_agent(&mut v, &a) {
            Decision::Approved { .. } => {}
            d => panic!("expected approve {:?} got {:?}", i, d),
        }
    }
    let a = args("s5", 3_000_000_000_000_000_000_000_000);
    match as_agent(&mut v, &a) {
        Decision::Rejected { reason, .. } => assert_eq!(reason, ReasonCode::DailyCapExceeded),
        d => panic!("expected daily cap got {:?}", d),
    }
}

#[test]
fn amount_zero_invalid() {
    let mut v = setup();
    let a = args("z1", 0);
    match as_agent(&mut v, &a) {
        Decision::Rejected { reason, .. } => assert_eq!(reason, ReasonCode::InvalidInput),
        d => panic!("expected invalid got {:?}", d),
    }
}

#[test]
fn u128_max_no_panic() {
    let mut v = setup();
    let a = args("m1", u128::MAX);
    match as_agent(&mut v, &a) {
        Decision::Rejected { reason, .. } => assert_eq!(reason, ReasonCode::PerTxCapExceeded),
        d => panic!("expected pertx got {:?}", d),
    }
}

#[test]
fn duplicate_client_ref() {
    let mut v = setup();
    let a = args("dup", 1_000_000_000_000_000_000_000_000);
    let d1 = as_agent(&mut v, &a);
    let id = match d1 { Decision::Approved { request_id } => request_id, _ => panic!("first approve") };
    let d2 = as_agent(&mut v, &a);
    match d2 {
        Decision::Duplicate { request_id, .. } => assert_eq!(request_id, id),
        d => panic!("expected duplicate got {:?}", d),
    }
}

#[test]
fn rate_limit() {
    let mut v = setup();
    let mut agent = v.agents.get(&agent_pk().to_string()).cloned().unwrap();
    agent.policy.max_requests_per_hour = 2;
    v.agents.insert(agent_pk().to_string(), agent);
    let _ = as_agent(&mut v, &args("rr1", 1));
    let _ = as_agent(&mut v, &args("rr2", 1));
    match as_agent(&mut v, &args("rr3", 1)) {
        Decision::Rejected { reason, .. } => assert_eq!(reason, ReasonCode::RateLimitExceeded),
        d => panic!("expected rate got {:?}", d),
    }
}

#[test]
fn asset_not_allowed() {
    let mut v = setup();
    let mut a = args("a1", 1);
    a.asset = Asset::FT("token.testnet".parse().unwrap());
    match as_agent(&mut v, &a) {
        Decision::Rejected { reason, .. } => assert_eq!(reason, ReasonCode::AssetNotAllowed),
        d => panic!("expected asset got {:?}", d),
    }
}

#[test]
fn frozen_agent() {
    let mut v = setup();
    let mut c = ctx();
    c.predecessor_account_id("owner.testnet".parse().unwrap());
    near_sdk::testing_env!(c.build());
    v.freeze_agent_inner(agent_pk());
    match as_agent(&mut v, &args("f1", 1)) {
        Decision::Rejected { reason, .. } => assert_eq!(reason, ReasonCode::AgentFrozen),
        d => panic!("expected frozen got {:?}", d),
    }
}

#[test]
fn policy_expired() {
    let mut v = setup();
    let mut agent = v.agents.get(&agent_pk().to_string()).cloned().unwrap();
    agent.policy.expires_at_ns = Some(1);
    v.agents.insert(agent_pk().to_string(), agent);
    match as_agent(&mut v, &args("e1", 1)) {
        Decision::Rejected { reason, .. } => assert_eq!(reason, ReasonCode::PolicyExpired),
        d => panic!("expected expired got {:?}", d),
    }
}

#[test]
fn vault_paused() {
    let mut v = setup();
    let mut c = ctx();
    c.predecessor_account_id("owner.testnet".parse().unwrap());
    near_sdk::testing_env!(c.build());
    v.pause_inner();
    match as_agent(&mut v, &args("p1", 1)) {
        Decision::Rejected { reason, .. } => assert_eq!(reason, ReasonCode::VaultPaused),
        d => panic!("expected paused got {:?}", d),
    }
}

#[test]
fn auto_freeze_after_violations() {
    let mut v = setup();
    for i in 0..3 {
        let mut a = args(&format!("v{}", i), 1);
        a.address = "attacker.testnet".to_string();
        let _ = as_agent(&mut v, &a);
    }
    let agent = v.agents.get(&agent_pk().to_string()).cloned().unwrap();
    assert_eq!(agent.status, AgentStatus::Frozen);
    match as_agent(&mut v, &args("after", 1)) {
        Decision::Rejected { reason, .. } => assert_eq!(reason, ReasonCode::AgentFrozen),
        d => panic!("expected frozen got {:?}", d),
    }
}

#[test]
fn pending_approval_above_cosign() {
    let mut v = setup();
    let a = args("c1", 11_000_000_000_000_000_000_000_000);
    match as_agent(&mut v, &a) {
        Decision::PendingApproval { .. } => {}
        d => panic!("expected pending got {:?}", d),
    }
}

#[test]
fn rejected_persisted() {
    let mut v = setup();
    let mut a = args("p1", 1);
    a.address = "attacker.testnet".to_string();
    let id = match as_agent(&mut v, &a) {
        Decision::Rejected { request_id, .. } => request_id,
        d => panic!("expected reject got {:?}", d),
    };
    let stored = v.requests.get(&id).cloned().unwrap();
    assert_eq!(stored.status, RequestStatus::Rejected);
    assert_eq!(stored.reason, Some(ReasonCode::PayeeNotAllowed));
}

#[test]
fn day_rollover_resets() {
    let mut v = setup();
    let a = args("d1", 5_000_000_000_000_000_000_000_000);
    let _ = as_agent(&mut v, &a);
    let mut c = ctx();
    c.signer_account_id("vault.testnet".parse().unwrap());
    c.predecessor_account_id("vault.testnet".parse().unwrap());
    c.signer_account_pk(agent_pk());
    c.block_timestamp(90_000_000_000_000);
    near_sdk::testing_env!(c.build());
    let db = v.day_bucket();
    assert!(db > 0);
    let a2 = args("d2", 5_000_000_000_000_000_000_000_000);
    match v.request_payment_inner(a2) {
        Decision::Approved { .. } => {}
        d => panic!("expected approve after rollover got {:?}", d),
    }
}

#[test]
fn evm_case_insensitive() {
    let mut v = setup();
    let mut agent = v.agents.get(&agent_pk().to_string()).cloned().unwrap();
    agent.policy.payees.push(Payee {
        label: "EVM".to_string(),
        chain: "eth".to_string(),
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_string(),
        allowed_dest_assets: vec![],
    });
    v.agents.insert(agent_pk().to_string(), agent);
    let mut a = args("evm", 1);
    a.chain = "eth".to_string();
    a.address = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA".to_string();
    a.dest_asset = Some("USDC".to_string());
    match as_agent(&mut v, &a) {
        Decision::Approved { request_id } => {
            let req = v.requests.get(&request_id).cloned().unwrap();
            assert_eq!(req.status, RequestStatus::AwaitingExecution);
        }
        d => panic!("expected awaiting got {:?}", d),
    }
}

#[test]
fn owner_approve_pending_success() {
    let mut v = setup();
    let a = args("ap1", 11_000_000_000_000_000_000_000_000);
    let id = match as_agent(&mut v, &a) {
        Decision::PendingApproval { request_id } => request_id,
        d => panic!("expected pending got {:?}", d),
    };
    let mut c = ctx();
    c.predecessor_account_id("owner.testnet".parse().unwrap());
    near_sdk::testing_env!(c.build());
    assert!(v.approve_request_inner(id));
    let req = v.requests.get(&id).cloned().unwrap();
    assert_eq!(req.status, RequestStatus::Approved);
}

#[test]
fn approval_revalidation_fails_after_daily_cut() {
    let mut v = setup();
    let a = args("ap2", 11_000_000_000_000_000_000_000_000);
    let id = match as_agent(&mut v, &a) {
        Decision::PendingApproval { request_id } => request_id,
        d => panic!("expected pending got {:?}", d),
    };
    // owner cuts daily max below the pending amount
    let mut c = ctx();
    c.predecessor_account_id("owner.testnet".parse().unwrap());
    near_sdk::testing_env!(c.build());
    let mut agent = v.agents.get(&agent_pk().to_string()).cloned().unwrap();
    agent.policy.limits[0].daily_max = U128(5_000_000_000_000_000_000_000_000);
    v.agents.insert(agent_pk().to_string(), agent);
    assert!(!v.approve_request_inner(id));
    let req = v.requests.get(&id).cloned().unwrap();
    assert_eq!(req.status, RequestStatus::Rejected);
    assert_eq!(req.reason, Some(ReasonCode::DailyCapExceeded));
}

#[test]
fn changes_feed_incremental() {
    let mut v = setup();
    let _ = as_agent(&mut v, &args("cf1", 1));
    let mut a = args("cf2", 1);
    a.address = "attacker.testnet".to_string();
    let _ = as_agent(&mut v, &a);
    let feed = v.get_changes_since_inner(0, 10);
    assert!(feed.requests.len() >= 2);
    assert!(feed.latest_seq >= feed.requests.len() as u64);
}
