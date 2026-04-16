use anyhow::{Context as AnyhowContext, Result};
use quick_js::Context;
use serde_json::json;

pub fn register(ctx: &Context) -> Result<()> {
    ctx.add_callback("success", |data: String| {
        json!({"success": true, "data": data}).to_string()
    })
    .context("Failed to add success callback")?;
    ctx.add_callback("fail", |error: String| {
        json!({"success": false, "error": error}).to_string()
    })
    .context("Failed to add fail callback")?;
    Ok(())
}
