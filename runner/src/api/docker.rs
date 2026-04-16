use anyhow::{Context as AnyhowContext, Result};
use quick_js::Context;
use serde_json::json;
use std::path::{Path, PathBuf};
use std::process::Command;

macro_rules! add_callback {
    ($ctx:expr, $name:expr, $path:expr, $handler:expr) => {{
        let p = $path.clone();
        $ctx.add_callback($name, move |a: String| $handler(&p, a))
            .context(concat!("Failed to add ", stringify!($name)))?;
    }};
    ($ctx:expr, $name:expr, $path:expr, $handler:expr, 2) => {{
        let p = $path.clone();
        $ctx.add_callback($name, move |a: String, b: i32| $handler(&p, a, b))
            .context(concat!("Failed to add ", stringify!($name)))?;
    }};
    ($ctx:expr, $name:expr, $path:expr, $handler:expr, str2) => {{
        let p = $path.clone();
        $ctx.add_callback($name, move |a: String, b: String| $handler(&p, a, b))
            .context(concat!("Failed to add ", stringify!($name)))?;
    }};
    ($ctx:expr, $name:expr, $path:expr, $handler:expr, 0) => {{
        let p = $path.clone();
        $ctx.add_callback($name, move || $handler(&p))
            .context(concat!("Failed to add ", stringify!($name)))?;
    }};
}

pub fn register(ctx: &Context, base_path: PathBuf) -> Result<()> {
    add_callback!(ctx, "_dockerComposeUp", base_path, compose_up);
    add_callback!(ctx, "_dockerComposeDown", base_path, compose_down, 0);
    add_callback!(ctx, "_dockerComposePull", base_path, compose_pull, 0);
    add_callback!(ctx, "_dockerComposeRestart", base_path, compose_restart);
    add_callback!(ctx, "_dockerComposeLogs", base_path, compose_logs, 2);
    add_callback!(ctx, "_dockerPs", base_path, ps, 0);
    add_callback!(ctx, "_dockerStart", base_path, start);
    add_callback!(ctx, "_dockerStop", base_path, stop);
    add_callback!(ctx, "_dockerExec", base_path, exec, str2);
    add_callback!(ctx, "_dockerInspect", base_path, inspect);
    add_callback!(ctx, "_dockerImages", base_path, images, 0);
    add_callback!(ctx, "_dockerPrune", base_path, prune, 0);

    let p = base_path.clone();
    ctx.add_callback(
        "_dockerCp",
        move |svc: String, src: String, dest: String, to_container: bool| {
            cp(&p, svc, src, dest, to_container)
        },
    )
    .context("Failed to add _dockerCp")?;

    ctx.eval(DOCKER_JS)
        .context("Failed to create docker object")?;
    Ok(())
}

const DOCKER_JS: &str = r#"
var docker = {
    compose: {
        up: function(o) { return _parseOrThrow(_dockerComposeUp(JSON.stringify(o||{})), 'compose up'); },
        down: function() { return _parseOrThrow(_dockerComposeDown(), 'compose down'); },
        pull: function() { return _parseOrThrow(_dockerComposePull(), 'compose pull'); },
        restart: function(s) { return _parseOrThrow(_dockerComposeRestart(s||''), 'compose restart'); },
        logs: function(s, n) { var d = JSON.parse(_dockerComposeLogs(s||'', n||100)); if(!d.success) throw new Error('compose logs: '+d.error); return d.logs; }
    },
    ps: function() { var d = JSON.parse(_dockerPs()); if(!d.success) throw new Error('ps: '+d.error); return d.containers; },
    start: function(s) { return _parseOrThrow(_dockerStart(s), 'start'); },
    stop: function(s) { return _parseOrThrow(_dockerStop(s), 'stop'); },
    exec: function(s, c) { return _parseOrThrow(_dockerExec(s, c), 'exec'); },
    inspect: function(s) { var d = JSON.parse(_dockerInspect(s)); if(!d.success) throw new Error('inspect: '+d.error); return JSON.parse(d.output); },
    images: function() { var d = JSON.parse(_dockerImages()); if(!d.success) throw new Error('images: '+d.error); return d.images; },
    prune: function() { return _parseOrThrow(_dockerPrune(), 'prune'); },
    cp: {
        toContainer: function(s, src, dest) { return _parseOrThrow(_dockerCp(s, src, dest, true), 'cp to container'); },
        fromContainer: function(s, src, dest) { return _parseOrThrow(_dockerCp(s, src, dest, false), 'cp from container'); }
    }
};
function _parseOrThrow(r, op) { var d = JSON.parse(r); if(!d.success) throw new Error(op+': '+d.error); return d; }
"#;

fn err_json(e: impl std::fmt::Display) -> String {
    json!({"success": false, "error": e.to_string()}).to_string()
}

fn run_cmd(mut cmd: Command) -> String {
    match cmd.output() {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let stderr = String::from_utf8_lossy(&out.stderr);
            if out.status.success() {
                json!({"success": true, "stdout": stdout, "stderr": stderr}).to_string()
            } else {
                json!({"success": false, "error": stderr, "stdout": stdout}).to_string()
            }
        }
        Err(e) => err_json(e),
    }
}

fn compose_cmd(path: &Path) -> Command {
    let mut cmd = Command::new("docker");
    cmd.arg("compose").current_dir(path);
    cmd
}

fn compose_up(path: &Path, options: String) -> String {
    #[derive(serde::Deserialize, Default)]
    struct Opts {
        #[serde(default)]
        detach: bool,
        #[serde(default)]
        force_recreate: bool,
    }
    let opts: Opts = serde_json::from_str(&options).unwrap_or_default();
    let mut cmd = compose_cmd(path);
    cmd.arg("up");
    if opts.detach {
        cmd.arg("-d");
    }
    if opts.force_recreate {
        cmd.arg("--force-recreate");
    }
    run_cmd(cmd)
}

fn compose_down(path: &Path) -> String {
    run_cmd({
        let mut c = compose_cmd(path);
        c.arg("down");
        c
    })
}
fn compose_pull(path: &Path) -> String {
    run_cmd({
        let mut c = compose_cmd(path);
        c.arg("pull");
        c
    })
}

fn compose_restart(path: &Path, service: String) -> String {
    let mut cmd = compose_cmd(path);
    cmd.arg("restart");
    if !service.is_empty() {
        cmd.arg(&service);
    }
    run_cmd(cmd)
}

fn compose_logs(path: &Path, service: String, lines: i32) -> String {
    let mut cmd = compose_cmd(path);
    cmd.args(["logs", "--tail", &lines.to_string()]);
    if !service.is_empty() {
        cmd.arg(&service);
    }
    match cmd.output() {
        Ok(out) if out.status.success() => {
            json!({"success": true, "logs": String::from_utf8_lossy(&out.stdout)}).to_string()
        }
        Ok(out) => err_json(String::from_utf8_lossy(&out.stderr)),
        Err(e) => err_json(e),
    }
}

fn ps(path: &Path) -> String {
    let mut cmd = compose_cmd(path);
    cmd.args(["ps", "--format", "json"]);
    match cmd.output() {
        Ok(out) if out.status.success() => {
            json!({"success": true, "containers": String::from_utf8_lossy(&out.stdout)}).to_string()
        }
        Ok(out) => err_json(String::from_utf8_lossy(&out.stderr)),
        Err(e) => err_json(e),
    }
}

fn start(path: &Path, service: String) -> String {
    let mut cmd = compose_cmd(path);
    cmd.arg("start");
    if !service.is_empty() {
        cmd.arg(&service);
    }
    run_cmd(cmd)
}

fn stop(path: &Path, service: String) -> String {
    let mut cmd = compose_cmd(path);
    cmd.arg("stop");
    if !service.is_empty() {
        cmd.arg(&service);
    }
    run_cmd(cmd)
}

fn exec(path: &Path, service: String, command: String) -> String {
    if service.is_empty() {
        return err_json("Service name is required");
    }
    let mut cmd = compose_cmd(path);
    cmd.args(["exec", "-T", &service, "sh", "-c", &command]);
    match cmd.output() {
        Ok(out) => json!({
            "success": out.status.success(),
            "exitCode": out.status.code().unwrap_or(-1),
            "stdout": String::from_utf8_lossy(&out.stdout),
            "stderr": String::from_utf8_lossy(&out.stderr)
        })
        .to_string(),
        Err(e) => err_json(e),
    }
}

fn get_container_id(path: &Path, service: &str) -> Result<String, String> {
    let out = compose_cmd(path)
        .args(["ps", "-q", service])
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err("Failed to find container".into());
    }
    let id = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if id.is_empty() {
        Err("Container not found or not running".into())
    } else {
        Ok(id)
    }
}

fn inspect(path: &Path, service: String) -> String {
    if service.is_empty() {
        return err_json("Service name is required");
    }
    let id = match get_container_id(path, &service) {
        Ok(id) => id,
        Err(e) => return err_json(e),
    };
    match Command::new("docker").args(["inspect", &id]).output() {
        Ok(out) if out.status.success() => {
            json!({"success": true, "output": String::from_utf8_lossy(&out.stdout)}).to_string()
        }
        Ok(out) => err_json(String::from_utf8_lossy(&out.stderr)),
        Err(e) => err_json(e),
    }
}

fn images(path: &Path) -> String {
    let mut cmd = compose_cmd(path);
    cmd.args(["images", "--format", "json"]);
    match cmd.output() {
        Ok(out) if out.status.success() => {
            json!({"success": true, "images": String::from_utf8_lossy(&out.stdout)}).to_string()
        }
        Ok(out) => err_json(String::from_utf8_lossy(&out.stderr)),
        Err(e) => err_json(e),
    }
}

fn prune(path: &Path) -> String {
    run_cmd({
        let mut c = Command::new("docker");
        c.args(["image", "prune", "-f"]).current_dir(path);
        c
    })
}

fn cp(path: &Path, service: String, src: String, dest: String, to_container: bool) -> String {
    if service.is_empty() {
        return err_json("Service name is required");
    }
    let id = match get_container_id(path, &service) {
        Ok(id) => id,
        Err(e) => return err_json(e),
    };
    let mut cmd = Command::new("docker");
    cmd.arg("cp");
    if to_container {
        cmd.arg(path.join(&src).to_string_lossy().to_string())
            .arg(format!("{}:{}", id, dest));
    } else {
        cmd.arg(format!("{}:{}", id, src))
            .arg(path.join(&dest).to_string_lossy().to_string());
    }
    run_cmd(cmd)
}
