use near_sdk::serde_json;

pub fn emit(event: &str, data: serde_json::Value) {
    let payload = serde_json::json!({
        "standard": "agentvault",
        "version": "1.0.0",
        "event": event,
        "data": [data],
    });
    near_sdk::env::log_str(&format!("EVENT_JSON:{}", payload));
}
