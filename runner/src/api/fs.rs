use anyhow::{Context as AnyhowContext, Result};
use quick_js::Context;
use serde_json::json;
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::utils::path::resolve_sandboxed_path;

macro_rules! add_fs_callback {
    ($ctx:expr, $name:expr, $path:expr, $handler:expr) => {{
        let p = $path.clone();
        $ctx.add_callback($name, move |a: String| $handler(&p, a))
            .context(concat!("Failed to add ", stringify!($name)))?;
    }};
    ($ctx:expr, $name:expr, $path:expr, $handler:expr, 2) => {{
        let p = $path.clone();
        $ctx.add_callback($name, move |a: String, b: String| $handler(&p, a, b))
            .context(concat!("Failed to add ", stringify!($name)))?;
    }};
}

pub fn register(ctx: &Context, base_path: PathBuf) -> Result<()> {
    add_fs_callback!(ctx, "_fsReadFile", base_path, read_file);
    add_fs_callback!(ctx, "_fsWriteFile", base_path, write_file, 2);
    add_fs_callback!(ctx, "_fsAppendFile", base_path, append_file, 2);
    add_fs_callback!(ctx, "_fsDeleteFile", base_path, delete_file);
    add_fs_callback!(ctx, "_fsExists", base_path, exists);
    add_fs_callback!(ctx, "_fsReaddir", base_path, readdir);
    add_fs_callback!(ctx, "_fsMkdir", base_path, mkdir);

    ctx.eval(FS_JS).context("Failed to create fs object")?;
    Ok(())
}

const FS_JS: &str = r#"
var fs = {
    readFile: function(p) { var d = JSON.parse(_fsReadFile(p)); if(!d.success) throw new Error('Read failed: '+d.error); return d.content; },
    writeFile: function(p, c) { var d = JSON.parse(_fsWriteFile(p, c)); if(!d.success) throw new Error('Write failed: '+d.error); return true; },
    appendFile: function(p, c) { var d = JSON.parse(_fsAppendFile(p, c)); if(!d.success) throw new Error('Append failed: '+d.error); return true; },
    deleteFile: function(p) { var d = JSON.parse(_fsDeleteFile(p)); if(!d.success) throw new Error('Delete failed: '+d.error); return true; },
    exists: function(p) { return JSON.parse(_fsExists(p)).exists; },
    readdir: function(p) { var d = JSON.parse(_fsReaddir(p||'.')); if(!d.success) throw new Error('Readdir failed: '+d.error); return d.entries; },
    mkdir: function(p) { var d = JSON.parse(_fsMkdir(p)); if(!d.success) throw new Error('Mkdir failed: '+d.error); return true; }
};
"#;

fn err(e: impl std::fmt::Display) -> String {
    json!({"success": false, "error": e.to_string()}).to_string()
}

fn resolve(base: &Path, path: String) -> Result<PathBuf, String> {
    resolve_sandboxed_path(base, path)
}

fn read_file(base: &Path, path: String) -> String {
    match resolve(base, path).and_then(|p| std::fs::read_to_string(&p).map_err(|e| e.to_string())) {
        Ok(content) => json!({"success": true, "content": content}).to_string(),
        Err(e) => err(e),
    }
}

fn write_file(base: &Path, path: String, content: String) -> String {
    let resolved = match resolve(base, path) {
        Ok(p) => p,
        Err(e) => return err(e),
    };
    if let Some(parent) = resolved.parent() {
        if !parent.exists() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                return err(format!("Failed to create parent directories: {}", e));
            }
        }
    }
    match std::fs::write(&resolved, content) {
        Ok(_) => json!({"success": true}).to_string(),
        Err(e) => err(e),
    }
}

fn append_file(base: &Path, path: String, content: String) -> String {
    let resolved = match resolve(base, path) {
        Ok(p) => p,
        Err(e) => return err(e),
    };
    match std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&resolved)
    {
        Ok(mut file) => match file.write_all(content.as_bytes()) {
            Ok(_) => json!({"success": true}).to_string(),
            Err(e) => err(e),
        },
        Err(e) => err(e),
    }
}

fn delete_file(base: &Path, path: String) -> String {
    match resolve(base, path).and_then(|p| std::fs::remove_file(&p).map_err(|e| e.to_string())) {
        Ok(_) => json!({"success": true}).to_string(),
        Err(e) => err(e),
    }
}

fn exists(base: &Path, path: String) -> String {
    json!({"exists": resolve(base, path).map(|p| p.exists()).unwrap_or(false)}).to_string()
}

fn readdir(base: &Path, path: String) -> String {
    let resolved = match resolve(base, path) {
        Ok(p) => p,
        Err(e) => return err(e),
    };
    match std::fs::read_dir(&resolved) {
        Ok(entries) => {
            let result: Vec<_> = entries
                .filter_map(|e| e.ok())
                .filter_map(|e| {
                    let ft = e.file_type().ok()?;
                    Some(json!({"name": e.file_name().to_str()?, "isFile": ft.is_file(), "isDirectory": ft.is_dir()}))
                })
                .collect();
            json!({"success": true, "entries": result}).to_string()
        }
        Err(e) => err(e),
    }
}

fn mkdir(base: &Path, path: String) -> String {
    match resolve(base, path).and_then(|p| std::fs::create_dir_all(&p).map_err(|e| e.to_string())) {
        Ok(_) => json!({"success": true}).to_string(),
        Err(e) => err(e),
    }
}
