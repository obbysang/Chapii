use crate::agent::reason_str;
use crate::events;
use crate::types::{ReasonCode, RequestStatus};
use crate::Vault;
use near_sdk::{env, near, require};

impl Vault {
    pub fn on_payment_resolved_inner(&mut self, request_id: u64) {
        require!(env::promise_results_count() == 1, "expected one promise result");
        let ok = env::promise_result_checked(0, 1024).is_ok();
        let mut req = self.requests.get(&request_id).cloned().unwrap_or_else(|| env::panic_str("unknown request"));
        require!(
            req.status == RequestStatus::Approved,
            "request is not in Approved status"
        );
        match ok {
            true => {
                req.status = RequestStatus::Completed;
                req.decided_ns = Some(env::block_timestamp());
                self.requests.insert(request_id, req);
                self.bump_change(request_id);
                events::emit_payment_completed(request_id);
            }
            false => {
                self.revert_usage(
                    &req.agent_pk.to_string(),
                    &req.asset.clone(),
                    req.amount.0,
                    self.day_bucket_at(req.created_ns),
                );
                req.status = RequestStatus::Failed;
                req.reason = Some(ReasonCode::TransferFailed);
                req.decided_ns = Some(env::block_timestamp());
                self.requests.insert(request_id, req);
                self.bump_change(request_id);
                events::emit_payment_failed(request_id, reason_str(ReasonCode::TransferFailed));
            }
        }
    }

    pub fn on_crosschain_funded_inner(&mut self, request_id: u64) {
        require!(env::promise_results_count() == 1, "expected one promise result");
        let ok = env::promise_result_checked(0, 1024).is_ok();
        let mut req = self.requests.get(&request_id).cloned().unwrap_or_else(|| env::panic_str("unknown request"));
        require!(
            req.status == RequestStatus::Executing,
            "request is not in Executing status"
        );
        match ok {
            true => {
                let deposit = req.deposit_address.clone().unwrap_or_default();
                events::emit_crosschain_funded(request_id, &deposit);
            }
            false => {
                self.revert_usage(
                    &req.agent_pk.to_string(),
                    &req.asset.clone(),
                    req.amount.0,
                    self.day_bucket_at(req.created_ns),
                );
                req.status = RequestStatus::Failed;
                req.reason = Some(ReasonCode::TransferFailed);
                req.decided_ns = Some(env::block_timestamp());
                self.requests.insert(request_id, req);
                self.bump_change(request_id);
                events::emit_payment_failed(request_id, reason_str(ReasonCode::TransferFailed));
            }
        }
    }


}
