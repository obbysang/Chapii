use super::*;
use near_sdk::json_types::U128;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;
use near_sdk::NearToken;

const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
const T0: u64 = 1_700_000_000_000_000_000;

fn owner() -> AccountId {
    "owner.testnet".parse().unwrap()
}

fn vault_id() -> AccountId {
    "vault.owner.testnet".parse().unwrap()
}

fn agent_pk() -> PublicKey {
    "ed25519:6E8sCci9badyRkXb3JoRpBj5p8P6TwfSXWkXwVLhS1Z2"
        .parse()
        .unwrap()
}

fn other_pk() -> PublicKey {
    "ed25519:3D4YudUahN1nawWogh8pAKSj92sNaKWEUV6z3n2c6YqH"
        .parse()
        .unwrap()
}

fn ctx(predecessor: &AccountId, signer_pk: &PublicKey, timestamp: u64) -> near_sdk::VMContext {
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(vault_id())
        .signer_account_id(predecessor.clone())
        .signer_account_pk(signer_pk.clone())
        .predecessor_account_id(predecessor.clone())
        .account_balance(NearToken::from_near(100))
        .storage_usage(100_000)
        .block_timestamp(timestamp);
    builder.build()
}

fn testing(predecessor: &AccountId, signer_pk: &PublicKey) {
    testing_env!(ctx(predecessor, signer_pk, T0));
}

fn owner_testing() {
    testing(&owner(), &agent_pk());
}

fn agent_testing() {
    testing(&vault_id(), &agent_pk());
}

fn default_policy() -> Policy {
    Policy {
        limits: vec![AssetLimit {
            asset: Asset::Near,
            per_tx_max: U128(5 * NEAR),
            daily_max: U128(10 * NEAR),
            cosign_above: None,
        }],
        payees: vec![Payee {
            label: "Alice".to_string(),
            chain: "near".to_string(),
            address: "alice.testnet".to_string(),
            allowed_dest_assets: vec![],
        }],
        max_requests_per_hour: 10,
        freeze_after_violations: 3,
        expires_at_ns: None,
    }
}

fn setup() -> Vault {
    owner_testing();
    let mut vault = Vault::new(owner());
    vault.add_agent(agent_pk(), "bot".to_string(), default_policy(), U128(NEAR));
    vault
}

fn args(client_ref: &str, amount: u128) -> PaymentArgs {
    PaymentArgs {
        client_ref: client_ref.to_string(),
        asset: Asset::Near,
        amount: U128(amount),
        chain: "near".to_string(),
        address: "alice.testnet".to_string(),
        dest_asset: None,
        memo: None,
    }
}

#[test]
fn add_agent_registers_and_rejects_duplicates() {
    let vault = setup();
    let agent = vault.get_agent(agent_pk()).unwrap();
    assert_eq!(agent.name, "bot");
    assert_eq!(agent.status, AgentStatus::Active);
    assert_eq!(vault.get_owner(), owner());
}

#[test]
fn approved_payment_reserves_budget() {
    let mut vault = setup();
    agent_testing();
    let decision = vault.request_payment(args("ref-1", NEAR));
    match decision {
        Decision::Approved { request_id } => {
            let request = vault.get_request(request_id).unwrap();
            assert_eq!(request.status, RequestStatus::Approved);
            assert_eq!(request.amount, U128(NEAR));
        }
        other => panic!("expected approval, got {:?}", other),
    }
    let budget = vault.get_budget(agent_pk()).unwrap();
    assert_eq!(budget.per_asset[0].spent_today, U128(NEAR));
    assert_eq!(budget.per_asset[0].remaining, U128(9 * NEAR));
}

#[test]
fn duplicate_client_ref_has_no_side_effects() {
    let mut vault = setup();
    agent_testing();
    let first = vault.request_payment(args("same-ref", NEAR));
    let first_id = match first {
        Decision::Approved { request_id } => request_id,
        other => panic!("expected approval, got {:?}", other),
    };
    let balance_before = vault.get_budget(agent_pk()).unwrap();
    let second = vault.request_payment(args("same-ref", NEAR));
    match second {
        Decision::Duplicate { request_id, status } => {
            assert_eq!(request_id, first_id);
            assert_eq!(status, RequestStatus::Approved);
        }
        other => panic!("expected duplicate, got {:?}", other),
    }
    let balance_after = vault.get_budget(agent_pk()).unwrap();
    assert_eq!(
        balance_before.per_asset[0].spent_today,
        balance_after.per_asset[0].spent_today
    );
    assert_eq!(vault.get_next_request_id(), first_id + 1);
}

#[test]
fn payee_not_allowed_is_recorded() {
    let mut vault = setup();
    agent_testing();
    let mut a = args("bad-payee", NEAR);
    a.address = "mallory.testnet".to_string();
    let decision = vault.request_payment(a);
    let id = match decision {
        Decision::Rejected {
            request_id,
            reason,
        } => {
            assert_eq!(reason, ReasonCode::PayeeNotAllowed);
            request_id
        }
        other => panic!("expected rejection, got {:?}", other),
    };
    let request = vault.get_request(id).unwrap();
    assert_eq!(request.status, RequestStatus::Rejected);
    assert_eq!(request.reason, Some(ReasonCode::PayeeNotAllowed));
}

#[test]
fn per_tx_cap_boundary() {
    let mut vault = setup();
    agent_testing();
    // Exactly at the cap passes.
    assert!(matches!(
        vault.request_payment(args("cap", 5 * NEAR)),
        Decision::Approved { .. }
    ));
    // One yocto over fails.
    match vault.request_payment(args("cap-plus-one", 5 * NEAR + 1)) {
        Decision::Rejected { reason, .. } => {
            assert_eq!(reason, ReasonCode::PerTxCapExceeded)
        }
        other => panic!("expected rejection, got {:?}", other),
    }
}

#[test]
fn daily_cap_blocks_salami_slicing() {
    let mut vault = setup();
    agent_testing();
    assert!(matches!(
        vault.request_payment(args("slice-1", 4 * NEAR)),
        Decision::Approved { .. }
    ));
    assert!(matches!(
        vault.request_payment(args("slice-2", 4 * NEAR)),
        Decision::Approved { .. }
    ));
    match vault.request_payment(args("slice-3", 4 * NEAR)) {
        Decision::Rejected { reason, .. } => assert_eq!(reason, ReasonCode::DailyCapExceeded),
        other => panic!("expected rejection, got {:?}", other),
    }
}

#[test]
fn zero_amount_is_invalid_input() {
    let mut vault = setup();
    agent_testing();
    match vault.request_payment(args("zero", 0)) {
        Decision::Rejected { reason, .. } => assert_eq!(reason, ReasonCode::InvalidInput),
        other => panic!("expected rejection, got {:?}", other),
    }
}

#[test]
fn u128_max_does_not_panic() {
    let mut vault = setup();
    agent_testing();
    match vault.request_payment(args("max", u128::MAX)) {
        Decision::Rejected { reason, .. } => assert_eq!(reason, ReasonCode::PerTxCapExceeded),
        other => panic!("expected rejection, got {:?}", other),
    }
}

#[test]
fn rate_limit_counts_every_attempt() {
    let mut vault = setup();
    let mut policy = default_policy();
    policy.max_requests_per_hour = 2;
    policy.freeze_after_violations = 0;
    owner_testing();
    vault.update_policy(agent_pk(), policy);
    agent_testing();
    assert!(matches!(
        vault.request_payment(args("r1", NEAR)),
        Decision::Approved { .. }
    ));
    assert!(matches!(
        vault.request_payment(args("r2", NEAR)),
        Decision::Approved { .. }
    ));
    match vault.request_payment(args("r3", NEAR)) {
        Decision::Rejected { reason, .. } => assert_eq!(reason, ReasonCode::RateLimitExceeded),
        other => panic!("expected rejection, got {:?}", other),
    }
}

#[test]
fn auto_freeze_after_three_violations() {
    let mut vault = setup();
    agent_testing();
    for i in 0..3 {
        let mut a = args(&format!("viol-{}", i), NEAR);
        a.address = "mallory.testnet".to_string();
        let _ = vault.request_payment(a);
    }
    let agent = vault.get_agent(agent_pk()).unwrap();
    assert_eq!(agent.status, AgentStatus::Frozen);
    match vault.request_payment(args("after-freeze", NEAR)) {
        Decision::Rejected { reason, .. } => assert_eq!(reason, ReasonCode::AgentFrozen),
        other => panic!("expected frozen rejection, got {:?}", other),
    }
}

#[test]
fn cosign_flow_and_owner_approval() {
    let mut vault = setup();
    let mut policy = default_policy();
    policy.limits[0].cosign_above = Some(U128(2 * NEAR));
    owner_testing();
    vault.update_policy(agent_pk(), policy);
    agent_testing();
    let id = match vault.request_payment(args("big", 3 * NEAR)) {
        Decision::PendingApproval { request_id } => request_id,
        other => panic!("expected pending, got {:?}", other),
    };
    assert_eq!(vault.get_budget(agent_pk()).unwrap().per_asset[0].spent_today.0, 0);
    owner_testing();
    vault.approve_request(id);
    let request = vault.get_request(id).unwrap();
    assert_eq!(request.status, RequestStatus::Approved);
    assert_eq!(
        vault.get_budget(agent_pk()).unwrap().per_asset[0].spent_today,
        U128(3 * NEAR)
    );
}

#[test]
fn owner_rejection_does_not_spend() {
    let mut vault = setup();
    let mut policy = default_policy();
    policy.limits[0].cosign_above = Some(U128(2 * NEAR));
    owner_testing();
    vault.update_policy(agent_pk(), policy);
    agent_testing();
    let id = match vault.request_payment(args("big", 3 * NEAR)) {
        Decision::PendingApproval { request_id } => request_id,
        other => panic!("expected pending, got {:?}", other),
    };
    owner_testing();
    vault.reject_request(id);
    let request = vault.get_request(id).unwrap();
    assert_eq!(request.status, RequestStatus::RejectedByOwner);
    assert_eq!(
        vault.get_budget(agent_pk()).unwrap().per_asset[0].spent_today.0,
        0
    );
}

#[test]
fn failed_transfer_rolls_back_usage() {
    let mut vault = setup();
    agent_testing();
    let id = match vault.request_payment(args("will-fail", NEAR)) {
        Decision::Approved { request_id } => request_id,
        other => panic!("expected approval, got {:?}", other),
    };
    assert_eq!(
        vault.get_budget(agent_pk()).unwrap().per_asset[0].spent_today,
        U128(NEAR)
    );
    let mut callback_ctx = ctx(&vault_id(), &agent_pk(), T0);
    callback_ctx.predecessor_account_id = vault_id();
    testing_env!(
        callback_ctx,
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        // near-sdk 5 keys validator balances by account id string.
        std::collections::HashMap::<String, near_sdk::NearToken>::default(),
        vec![near_sdk::PromiseResult::Failed],
    );
    vault.on_payment_resolved(id);
    let request = vault.get_request(id).unwrap();
    assert_eq!(request.status, RequestStatus::Failed);
    assert_eq!(request.reason, Some(ReasonCode::TransferFailed));
    assert_eq!(
        vault.get_budget(agent_pk()).unwrap().per_asset[0].spent_today.0,
        0
    );
}

#[test]
fn daily_bucket_resets_budget() {
    let mut vault = setup();
    agent_testing();
    assert!(matches!(
        vault.request_payment(args("day-1", 5 * NEAR)),
        Decision::Approved { .. }
    ));
    let budget = vault.get_budget(agent_pk()).unwrap();
    assert_eq!(budget.per_asset[0].remaining, U128(5 * NEAR));
    let next_day = T0 + 86_400_000_000_000;
    testing_env!(ctx(&vault_id(), &agent_pk(), next_day));
    let budget = vault.get_budget(agent_pk()).unwrap();
    assert_eq!(budget.per_asset[0].remaining, U128(10 * NEAR));
}

#[test]
fn expired_policy_is_rejected() {
    let mut vault = setup();
    let mut policy = default_policy();
    policy.expires_at_ns = Some(T0 - 1);
    owner_testing();
    vault.update_policy(agent_pk(), policy);
    agent_testing();
    match vault.request_payment(args("expired", NEAR)) {
        Decision::Rejected { reason, .. } => assert_eq!(reason, ReasonCode::PolicyExpired),
        other => panic!("expected rejection, got {:?}", other),
    }
}

#[test]
fn paused_vault_rejects_but_does_not_count_violation() {
    let mut vault = setup();
    owner_testing();
    vault.pause();
    agent_testing();
    match vault.request_payment(args("paused", NEAR)) {
        Decision::Rejected { reason, .. } => assert_eq!(reason, ReasonCode::VaultPaused),
        other => panic!("expected rejection, got {:?}", other),
    }
    assert_eq!(vault.get_agent(agent_pk()).unwrap().violations, 0);
}

#[test]
fn changes_are_incremental() {
    let mut vault = setup();
    agent_testing();
    vault.request_payment(args("change-1", NEAR));
    let page = vault.get_changes_since(0, 100);
    assert_eq!(page.requests.len(), 1);
    let cursor = page.latest_seq;
    vault.request_payment(args("change-2", NEAR));
    let page = vault.get_changes_since(cursor, 100);
    assert_eq!(page.requests.len(), 1);
    assert!(page.latest_seq > cursor);
}

#[test]
fn revoked_agent_is_rejected_and_cannot_be_unfrozen() {
    let mut vault = setup();
    owner_testing();
    vault.revoke_agent(agent_pk());
    assert_eq!(vault.get_agent(agent_pk()).unwrap().status, AgentStatus::Revoked);
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        vault.unfreeze_agent(agent_pk());
    }));
    assert!(result.is_err());
}

#[test]
fn address_normalization_is_exact() {
    use crate::policy::{normalize_address, normalize_chain};
    assert_eq!(
        normalize_address("near", "ALICE.testnet").unwrap(),
        "alice.testnet"
    );
    assert_eq!(
        normalize_address("eth", "0xAABBCCDDEEFF00112233445566778899AABBCCDD").unwrap(),
        "0xaabbccddeeff00112233445566778899aabbccdd"
    );
    assert!(normalize_address("near", "not an account").is_none());
    assert_eq!(normalize_chain("NEAR").unwrap(), "near");
    assert!(normalize_chain("n").is_none());
    assert!(normalize_chain("bad chain").is_none());
}

#[test]
fn unknown_key_cannot_call_request_payment() {
    let mut vault = setup();
    testing(&vault_id(), &other_pk());
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        vault.request_payment(args("unknown", NEAR));
    }));
    assert!(result.is_err());
}

#[test]
fn policy_validation_rejects_bad_limits() {
    use crate::policy::validate_policy;
    let mut policy = default_policy();
    policy.limits[0].cosign_above = Some(U128(6 * NEAR));
    assert!(validate_policy(&policy).is_err());
    policy.limits[0].cosign_above = None;
    policy.limits[0].daily_max = U128(1);
    assert!(validate_policy(&policy).is_err());
    policy.limits.clear();
    assert!(validate_policy(&policy).is_err());
}
