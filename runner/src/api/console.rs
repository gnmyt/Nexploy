use anyhow::{Context as AnyhowContext, Result};
use quick_js::Context;

pub fn register(ctx: &Context) -> Result<()> {
    ctx.eval(
        r#"
        var console = {
            log: function() {
                _consoleLog(Array.prototype.slice.call(arguments).map(function(a) {
                    return typeof a === 'object' ? JSON.stringify(a) : String(a);
                }).join(' '));
            }
        };
    "#,
    )
    .context("Failed to create console object")?;
    ctx.add_callback("_consoleLog", |msg: String| {
        println!("{}", msg);
        ""
    })
    .context("Failed to add console.log callback")?;
    Ok(())
}
