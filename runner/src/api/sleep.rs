use anyhow::{Context as AnyhowContext, Result};
use quick_js::Context;
use std::{thread, time::Duration};

pub fn register(ctx: &Context) -> Result<()> {
    ctx.add_callback("sleep", |ms: i32| {
        if ms > 0 {
            thread::sleep(Duration::from_millis(ms as u64));
        }
        ""
    })
    .context("Failed to add sleep callback")
}
