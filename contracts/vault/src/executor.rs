use crate::agent::{now_is_within_execution_window, reason_str};
use crate::events;
use crate::types::{AgentStatus, Asset, CrosschainOutcome, ReasonCode, RequestStatus};
use crate::Vault;
use near_sdk::{env, require, AccountId, NearToken, Promise};

impl Vault {
    fn assert_executor(&self) {
        let executor = self.executor_id.clone().unwrap_or_else(|| env::panic_str("no executor set"));
        require!(
            env::predecessor_account_id() == executor,
            "caller is not the executor"
        );
    }

    pub(crate) fn execute_crosschain_inner(&mut self, request_id: u64, deposit_address: String) -> Promise {
        self.assert_executor();
        let mut req = self.requests.get(&request_id).cloned().unwrap_or_else(|| env::panic_str("unknown request"));
        require!(req.status == RequestStatus::AwaitingExecution, "request is not awaiting execution");
        require!(now_is_within_execution_window(req.created_ns), "execution window expired");
        require!(!self.paused, "vault is paused");
        let agent_pk = req.agent_pk.to_string();
        let agent = self.agents.get(&agent_pk).cloned().unwrap_or_else(|| env::panic_str("unknown agent"));
        require!(
            agent.status == AgentStatus::Active,
            "agent is not active"
        );
        let token = match &req.asset {
            Asset::FT(t) => t.clone(),
            Asset::NEAR => env::panic_str("cross-chain payout requires an FT asset"),
        };
        require!(!deposit_address.is_empty(), "empty deposit address");
        req.deposit_address = Some(deposit_address.clone());
        req.status = RequestStatus::Executing;
        self.requests.insert(request_id, req.clone());
        self.bump_change(request_id);
        self.fulfill_crosschain(&req, token)
    }

    fn fulfill_crosschain(&mut self, req: &crate::types::PaymentRequest, token: AccountId) -> Promise {
        let deposit = req.deposit_address.clone().unwrap_or_default();
        Promise::new(token)
            .function_call(
                "ft_transfer".to_string(),
                serde_json::to_vec(&serde_json::json!({
                    "receiver_id": deposit,
                    "amount": req.amount,
                    "memo": ""
                }))
                .unwrap_or_default(),
                NearToken::from_yoctonear(1),
                near_sdk::Gas::from_tgas(50),
            )
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "on_crosschain_funded".to_string(),
                    serde_json::to_vec(&serde_json::json!({"request_id": req.id})).unwrap_or_default(),
                    NearToken::from_yoctonear(0),
                    near_sdk::Gas::from_tgas(50),
                ),
            )
    }

    pub(crate) fn report_crosschain_result_inner(
        &mut self,
        request_id: u64,
        outcome: CrosschainOutcome,
        settlement_ref: String,
    ) {
        self.assert_executor();
        let mut req = self.requests.get(&request_id).cloned().unwrap_or_else(|| env::panic_str("unknown request"));
        require!(req.status == RequestStatus::Executing, "request is not executing");
        match outcome {
            CrosschainOutcome::Delivered => {
                req.status = RequestStatus::Completed;
                req.settlement_ref = Some(settlement_ref);
                req.decided_ns = Some(env::block_timestamp());
                self.requests.insert(request_id, req);
                self.bump_change(request_id);
                events::emit_crosschain_settled(request_id, "Delivered");
            }
            CrosschainOutcome::Refunded | CrosschainOutcome::Failed => {
                self.revert_usage(
                    &req.agent_pk.to_string(),
                    &req.asset.clone(),
                    req.amount.0,
                    self.day_bucket_at(req.created_ns),
                );
                req.status = RequestStatus::Failed;
                req.reason = Some(ReasonCode::TransferFailed);
                req.settlement_ref = Some(settlement_ref);
                req.decided_ns = Some(env::block_timestamp());
                self.requests.insert(request_id, req);
                self.bump_change(request_id);
                events::emit_payment_failed(request_id, reason_str(ReasonCode::TransferFailed));
                events::emit_crosschain_settled(
                    request_id,
                    match outcome {
                        CrosschainOutcome::Refunded => "Refunded",
                        _ => "Failed",
                    },
                );
            }
        }
    }


}
