use near_sdk::env;

fn emit_standard_event(event: &str, data: serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{{\"standard\":\"agentvault\",\"version\":\"1.0.0\",\"event\":\"{}\",\"data\":[{}]}}",
        event, data
    ));
}

pub fn emit_agent_added(pk: &str, name: &str) {
    emit_standard_event("agent_added", serde_json::json!({ "agent_pk": pk, "name": name }));
}
pub fn emit_agent_policy_updated(pk: &str) {
    emit_standard_event("agent_policy_updated", serde_json::json!({ "agent_pk": pk }));
}
pub fn emit_agent_allowance_set(pk: &str, allowance: &str) {
    emit_standard_event("agent_allowance_set", serde_json::json!({ "agent_pk": pk, "allowance": allowance }));
}
pub fn emit_agent_frozen(pk: &str) {
    emit_standard_event("agent_frozen", serde_json::json!({ "agent_pk": pk }));
}
pub fn emit_agent_unfrozen(pk: &str) {
    emit_standard_event("agent_unfrozen", serde_json::json!({ "agent_pk": pk }));
}
pub fn emit_agent_revoked(pk: &str) {
    emit_standard_event("agent_revoked", serde_json::json!({ "agent_pk": pk }));
}
pub fn emit_agent_auto_frozen(pk: &str, violations: u32) {
    emit_standard_event("agent_auto_frozen", serde_json::json!({ "agent_pk": pk, "violations": violations }));
}
pub fn emit_payment_requested(id: u64, pk: &str, client_ref: &str) {
    emit_standard_event("payment_requested", serde_json::json!({ "request_id": id, "agent_pk": pk, "client_ref": client_ref }));
}
pub fn emit_payment_approved(id: u64) {
    emit_standard_event("payment_approved", serde_json::json!({ "request_id": id }));
}
pub fn emit_payment_rejected(id: u64, reason: &str) {
    emit_standard_event("payment_rejected", serde_json::json!({ "request_id": id, "reason": reason }));
}
pub fn emit_payment_pending(id: u64) {
    emit_standard_event("payment_pending", serde_json::json!({ "request_id": id }));
}
pub fn emit_payment_duplicate(id: u64) {
    emit_standard_event("payment_duplicate", serde_json::json!({ "request_id": id }));
}
pub fn emit_payment_completed(id: u64) {
    emit_standard_event("payment_completed", serde_json::json!({ "request_id": id }));
}
pub fn emit_payment_failed(id: u64, reason: &str) {
    emit_standard_event("payment_failed", serde_json::json!({ "request_id": id, "reason": reason }));
}
pub fn emit_owner_approved(id: u64) {
    emit_standard_event("owner_approved", serde_json::json!({ "request_id": id }));
}
pub fn emit_owner_rejected(id: u64) {
    emit_standard_event("owner_rejected", serde_json::json!({ "request_id": id }));
}
pub fn emit_crosschain_funded(id: u64, deposit_address: &str) {
    emit_standard_event("crosschain_funded", serde_json::json!({ "request_id": id, "deposit_address": deposit_address }));
}
pub fn emit_crosschain_settled(id: u64, outcome: &str) {
    emit_standard_event("crosschain_settled", serde_json::json!({ "request_id": id, "outcome": outcome }));
}
pub fn emit_vault_paused() {
    emit_standard_event("vault_paused", serde_json::json!({}));
}
pub fn emit_vault_unpaused() {
    emit_standard_event("vault_unpaused", serde_json::json!({}));
}
pub fn emit_executor_set(executor: Option<&str>) {
    emit_standard_event("executor_set", serde_json::json!({ "executor": executor.unwrap_or_default() }));
}
pub fn emit_withdrawal(asset: &str, amount: &str, to: &str) {
    emit_standard_event("withdrawal", serde_json::json!({ "asset": asset, "amount": amount, "to": to }));
}
