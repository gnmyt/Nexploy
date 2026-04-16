mod api;
mod utils;

use anyhow::{Context as AnyhowContext, Result};
use base64::{engine::general_purpose, Engine as _};
use clap::Parser;
use quick_js::Context;
use serde_json::{json, Value as JsonValue};
use std::path::PathBuf;

use api::{compose, console, docker, env, fetch, fs, shell, sleep, utils as api_utils};
use utils::js_value::js_value_to_json;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(short, long)]
    script: String,
    #[arg(short, long)]
    context: Option<String>,
    #[arg(short, long)]
    path: Option<String>,
}

fn decode_base64(input: &str, name: &str) -> Result<String> {
    let bytes = general_purpose::STANDARD
        .decode(input)
        .context(format!("Failed to decode Base64 {}", name))?;
    String::from_utf8(bytes).context(format!("Invalid UTF-8 in {}", name))
}

fn main() -> Result<()> {
    let args = Args::parse();
    let script = decode_base64(&args.script, "script")?;

    let context_data: JsonValue = args
        .context
        .map(|ctx| -> Result<JsonValue> {
            let ctx_str = decode_base64(&ctx, "context")?;
            serde_json::from_str(&ctx_str).context("Failed to parse context JSON")
        })
        .transpose()?
        .unwrap_or_else(|| json!({}));

    let base_path = args
        .path
        .map(|p| std::fs::canonicalize(&p).context("Failed to resolve base path"))
        .transpose()?;

    let result = run_javascript(&script, context_data, base_path)?;
    println!("{}", serde_json::to_string_pretty(&result)?);
    std::process::exit(if result["success"].as_bool() == Some(true) {
        0
    } else {
        1
    });
}

fn run_javascript(
    script: &str,
    context_data: JsonValue,
    base_path: Option<PathBuf>,
) -> Result<JsonValue> {
    let ctx = Context::new().context("Failed to create JS context")?;

    console::register(&ctx)?;
    ctx.eval(&format!("var context = {};", context_data))
        .context("Failed to set context object")?;
    fetch::register(&ctx)?;

    if let Some(ref path) = base_path {
        fs::register(&ctx, path.clone())?;
        docker::register(&ctx, path.clone())?;
        env::register(&ctx, path.clone())?;
        compose::register(&ctx, path.clone())?;
    }

    shell::register(&ctx)?;
    sleep::register(&ctx)?;
    api_utils::register(&ctx)?;

    Ok(match ctx.eval(script) {
        Ok(js_result) => json!({ "success": true, "result": js_value_to_json(&js_result) }),
        Err(e) => json!({ "success": false, "error": format!("{:?}", e) }),
    })
}
