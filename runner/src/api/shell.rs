use anyhow::{Context as AnyhowContext, Result};
use quick_js::Context;
use serde_json::json;
use std::process::Command;

pub fn register(ctx: &Context) -> Result<()> {
    ctx.add_callback("shell", execute)
        .context("Failed to add shell callback")?;
    ctx.add_callback("shellWithArgs", execute_with_args)
        .context("Failed to add shellWithArgs callback")?;
    Ok(())
}

fn cmd_result(out: std::io::Result<std::process::Output>) -> String {
    match out {
        Ok(r) => json!({
            "success": r.status.success(),
            "exitCode": r.status.code().unwrap_or(-1),
            "stdout": String::from_utf8_lossy(&r.stdout),
            "stderr": String::from_utf8_lossy(&r.stderr)
        })
        .to_string(),
        Err(e) => json!({"success": false, "error": e.to_string()}).to_string(),
    }
}

fn execute(command: String) -> String {
    cmd_result(Command::new("sh").arg("-c").arg(&command).output())
}

fn execute_with_args(program: String, args_json: String) -> String {
    match serde_json::from_str::<Vec<String>>(&args_json) {
        Ok(args) => cmd_result(Command::new(&program).args(&args).output()),
        Err(e) => {
            json!({"success": false, "error": format!("Invalid args JSON: {}", e)}).to_string()
        }
    }
}
