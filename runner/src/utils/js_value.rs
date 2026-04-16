use quick_js::JsValue;
use serde_json::Value as JsonValue;

pub fn js_value_to_json(value: &JsValue) -> JsonValue {
    match value {
        JsValue::Null | JsValue::Undefined => JsonValue::Null,
        JsValue::Bool(b) => JsonValue::Bool(*b),
        JsValue::Int(i) => JsonValue::Number((*i).into()),
        JsValue::Float(f) => {
            serde_json::Number::from_f64(*f).map_or(JsonValue::Null, JsonValue::Number)
        }
        JsValue::String(s) => JsonValue::String(s.clone()),
        v => JsonValue::String(format!("{:?}", v)),
    }
}
