use anyhow::{Context as AnyhowContext, Result};
use quick_js::Context;
use serde_json::json;
use std::collections::HashMap;

pub fn register(ctx: &Context) -> Result<()> {
    ctx.add_callback("_nativeFetch", native_fetch)
        .context("Failed to add _nativeFetch callback")?;
    ctx.eval(FETCH_JS)
        .context("Failed to create fetch polyfill")?;
    Ok(())
}

const FETCH_JS: &str = r#"
var fetch = function(url, options) {
    options = options || {};
    var nativeOptions = JSON.stringify({
        method: (options.method || 'GET').toUpperCase(),
        headers: options.headers || {},
        body: options.body || null
    });
    var response = JSON.parse(_nativeFetch(url, nativeOptions));
    return {
        ok: response.ok, status: response.status, statusText: response.statusText, headers: response.headers,
        text: function() { return response.body; },
        json: function() { try { return JSON.parse(response.body); } catch(e) { throw new Error('JSON parse failed: '+e.message); } },
        then: function(onFulfilled, onRejected) { try { return onFulfilled ? onFulfilled(this) : this; } catch(e) { return onRejected ? onRejected(e) : undefined; } }
    };
};
var Response = function(body, init) {
    init = init || {};
    this.ok = (init.status||200) >= 200 && (init.status||200) < 300;
    this.status = init.status || 200;
    this.statusText = init.statusText || '';
    this.headers = init.headers || {};
    this._body = body;
    this.text = function() { return this._body; };
    this.json = function() { return JSON.parse(this._body); };
};
"#;

fn native_fetch(url: String, options_json: String) -> String {
    #[derive(serde::Deserialize)]
    struct FetchOptions {
        method: String,
        headers: Option<HashMap<String, String>>,
        body: Option<String>,
    }

    let options: FetchOptions = match serde_json::from_str(&options_json) {
        Ok(opts) => opts,
        Err(e) => return json!({"ok": false, "status": 0, "statusText": "Bad Request", "headers": {}, "body": format!("Failed to parse fetch options: {}", e)}).to_string(),
    };

    let client = reqwest::blocking::Client::new();
    let method = options.method.as_str();
    let has_body = ["POST", "PUT", "PATCH"].contains(&method);

    let mut request = match method {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        "PATCH" => client.patch(&url),
        "HEAD" => client.head(&url),
        m => return json!({"ok": false, "status": 0, "statusText": "Method Not Allowed", "headers": {}, "body": format!("Unsupported HTTP method: {}", m)}).to_string(),
    };

    if has_body {
        if let Some(body) = options.body {
            request = request.body(body);
        }
    }

    if let Some(headers) = options.headers {
        for (k, v) in headers {
            request = request.header(k, v);
        }
    }

    match request.send() {
        Ok(response) => {
            let status = response.status();
            let headers_map: HashMap<_, _> = response.headers()
                .iter()
                .filter_map(|(k, v)| v.to_str().ok().map(|vs| (k.to_string(), vs.to_string())))
                .collect();
            let body = response.text().unwrap_or_default();
            json!({
                "ok": status.is_success(),
                "status": status.as_u16(),
                "statusText": status.canonical_reason().unwrap_or("Unknown"),
                "headers": headers_map,
                "body": body
            }).to_string()
        }
        Err(e) => json!({"ok": false, "status": 0, "statusText": "Network Error", "headers": {}, "body": format!("Fetch error: {}", e)}).to_string(),
    }
}
