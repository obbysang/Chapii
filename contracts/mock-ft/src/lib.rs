use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, payable, require, AccountId, NearToken};

#[near(contract_state)]
pub struct MockFt {
    owner_id: AccountId,
    total_supply: U128,
    balances: LookupMap<AccountId, U128>,
}

#[near]
impl MockFt {
    #[init]
    pub fn new(owner_id: AccountId, total_supply: U128) -> Self {
        let mut balances = LookupMap::new(b"b");
        balances.insert(owner_id.clone(), total_supply);
        Self {
            owner_id,
            total_supply,
            balances,
        }
    }

    pub fn ft_metadata(&self) -> serde_json::Value {
        serde_json::json!({
            "spec": "ft-1.0.0",
            "name": "AgentVault Test Token",
            "symbol": "AVT",
            "icon": null,
            "reference": null,
            "reference_hash": null,
            "decimals": 6,
        })
    }

    pub fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.balances.get(&account_id).copied().unwrap_or(U128(0))
    }

    pub fn ft_total_supply(&self) -> U128 {
        self.total_supply
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner_id.clone()
    }

    #[payable]
    pub fn storage_deposit(&mut self, account_id: Option<AccountId>) -> serde_json::Value {
        let account_id = account_id.unwrap_or_else(env::predecessor_account_id);
        if self.balances.get(&account_id).is_none() {
            self.balances.insert(account_id.clone(), U128(0));
        }
        serde_json::json!({
            "account_id": account_id,
            "total_deposit": env::attached_deposit(),
        })
    }

    #[payable]
    pub fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        require!(
            env::attached_deposit() == NearToken::from_yoctonear(1),
            "Requires attached deposit of exactly 1 yoctoNEAR"
        );
        require!(amount.0 > 0, "amount must be > 0");
        let sender = env::predecessor_account_id();
        require!(sender != receiver_id, "cannot transfer to self");
        let balance = self.balances.get(&sender).copied().unwrap_or(U128(0));
        require!(balance.0 >= amount.0, "insufficient balance");
        let new_balance = balance.0 - amount.0;
        if new_balance == 0 {
            self.balances.remove(&sender);
        } else {
            self.balances.insert(sender, U128(new_balance));
        }
        let receiver_balance = self.balances.get(&receiver_id).copied().unwrap_or(U128(0));
        self.balances
            .insert(receiver_id, U128(receiver_balance.0 + amount.0));
        near_sdk::env::log_str(&format!(
            "EVENT_JSON:{}",
            serde_json::json!({
                "standard": "nep141",
                "version": "1.0.0",
                "event": "ft_transfer",
                "data": [{
                    "old_owner_id": sender,
                    "new_owner_id": receiver_id,
                    "amount": amount,
                    "memo": memo,
                }]
            })
        ));
    }

    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "only owner can mint"
        );
        let balance = self.balances.get(&account_id).copied().unwrap_or(U128(0));
        self.balances
            .insert(account_id, U128(balance.0 + amount.0));
        self.total_supply = U128(self.total_supply.0 + amount.0);
    }
}
