use anyhow::{Context as AnyhowContext, Result};
use quick_js::Context;
use serde_json::json;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::utils::path::resolve_sandboxed_path;

macro_rules! add_env_callback {
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
    ($ctx:expr, $name:expr, $path:expr, $handler:expr, 3) => {{
        let p = $path.clone();
        $ctx.add_callback($name, move |a: String, b: String, c: String| $handler(&p, a, b, c))
            .context(concat!("Failed to add ", stringify!($name)))?;
    }};
}

pub fn register(ctx: &Context, base_path: PathBuf) -> Result<()> {
    add_env_callback!(ctx, "_envLoad", base_path, env_load);
    add_env_callback!(ctx, "_envGet", base_path, env_get, 2);
    add_env_callback!(ctx, "_envSet", base_path, env_set, 3);
    add_env_callback!(ctx, "_envRemove", base_path, env_remove, 2);
    add_env_callback!(ctx, "_envGetAll", base_path, env_get_all);
    add_env_callback!(ctx, "_envSave", base_path, env_save, 2);

    ctx.eval(ENV_JS).context("Failed to create env object")?;
    Ok(())
}

const ENV_JS: &str = r#"
var env = {
    load: function(file) {
        var d = JSON.parse(_envLoad(file || '.env'));
        if (!d.success) throw new Error('env.load failed: ' + d.error);
        return d.values;
    },
    get: function(file, key) {
        var d = JSON.parse(_envGet(file || '.env', key));
        if (!d.success) throw new Error('env.get failed: ' + d.error);
        return d.value;
    },
    set: function(file, key, value) {
        var d = JSON.parse(_envSet(file || '.env', key, String(value)));
        if (!d.success) throw new Error('env.set failed: ' + d.error);
        return true;
    },
    remove: function(file, key) {
        var d = JSON.parse(_envRemove(file || '.env', key));
        if (!d.success) throw new Error('env.remove failed: ' + d.error);
        return true;
    },
    getAll: function(file) {
        var d = JSON.parse(_envGetAll(file || '.env'));
        if (!d.success) throw new Error('env.getAll failed: ' + d.error);
        return d.values;
    },
    save: function(file, obj) {
        var d = JSON.parse(_envSave(file || '.env', JSON.stringify(obj)));
        if (!d.success) throw new Error('env.save failed: ' + d.error);
        return true;
    }
};
"#;

fn err(e: impl std::fmt::Display) -> String {
    json!({"success": false, "error": e.to_string()}).to_string()
}

fn resolve(base: &Path, path: String) -> Result<PathBuf, String> {
    resolve_sandboxed_path(base, path)
}

fn parse_env_content(content: &str) -> BTreeMap<String, String> {
    let mut map = BTreeMap::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some(pos) = trimmed.find('=') {
            let key = trimmed[..pos].trim().to_string();
            let mut value = trimmed[pos + 1..].trim().to_string();
            if (value.starts_with('"') && value.ends_with('"'))
                || (value.starts_with('\'') && value.ends_with('\''))
            {
                value = value[1..value.len() - 1].to_string();
            }
            if !key.is_empty() {
                map.insert(key, value);
            }
        }
    }
    map
}

fn serialize_env(map: &BTreeMap<String, String>) -> String {
    map.iter()
        .map(|(k, v)| {
            if v.contains(' ') || v.contains('"') || v.contains('\'') || v.contains('#') {
                format!("{}=\"{}\"", k, v.replace('\\', "\\\\").replace('"', "\\\""))
            } else {
                format!("{}={}", k, v)
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
        + "\n"
}

fn env_load(base: &Path, file: String) -> String {
    match resolve(base, file)
        .and_then(|p| std::fs::read_to_string(&p).map_err(|e| e.to_string()))
    {
        Ok(content) => {
            let map = parse_env_content(&content);
            json!({"success": true, "values": map}).to_string()
        }
        Err(e) => err(e),
    }
}

fn env_get(base: &Path, file: String, key: String) -> String {
    match resolve(base, file.clone())
        .and_then(|p| std::fs::read_to_string(&p).map_err(|e| e.to_string()))
    {
        Ok(content) => {
            let map = parse_env_content(&content);
            match map.get(&key) {
                Some(v) => json!({"success": true, "value": v}).to_string(),
                None => json!({"success": true, "value": null}).to_string(),
            }
        }
        Err(_) => json!({"success": true, "value": null}).to_string(),
    }
}

fn env_set(base: &Path, file: String, key: String, value: String) -> String {
    let resolved = match resolve(base, file) {
        Ok(p) => p,
        Err(e) => return err(e),
    };

    let content = std::fs::read_to_string(&resolved).unwrap_or_default();
    let mut found = false;
    let mut lines: Vec<String> = content
        .lines()
        .map(|line| {
            let trimmed = line.trim();
            if !trimmed.starts_with('#') && !trimmed.is_empty() {
                if let Some(pos) = trimmed.find('=') {
                    let k = trimmed[..pos].trim();
                    if k == key {
                        found = true;
                        let formatted_value = if value.contains(' ')
                            || value.contains('"')
                            || value.contains('\'')
                            || value.contains('#')
                        {
                            format!(
                                "\"{}\"",
                                value.replace('\\', "\\\\").replace('"', "\\\"")
                            )
                        } else {
                            value.clone()
                        };
                        return format!("{}={}", key, formatted_value);
                    }
                }
            }
            line.to_string()
        })
        .collect();

    if !found {
        let formatted_value =
            if value.contains(' ') || value.contains('"') || value.contains('\'') || value.contains('#') {
                format!(
                    "\"{}\"",
                    value.replace('\\', "\\\\").replace('"', "\\\"")
                )
            } else {
                value.clone()
            };
        lines.push(format!("{}={}", key, formatted_value));
    }

    let result = lines.join("\n") + "\n";
    match std::fs::write(&resolved, result) {
        Ok(_) => json!({"success": true}).to_string(),
        Err(e) => err(e),
    }
}

fn env_remove(base: &Path, file: String, key: String) -> String {
    let resolved = match resolve(base, file) {
        Ok(p) => p,
        Err(e) => return err(e),
    };

    let content = match std::fs::read_to_string(&resolved) {
        Ok(c) => c,
        Err(e) => return err(e),
    };

    let lines: Vec<&str> = content
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            if trimmed.starts_with('#') || trimmed.is_empty() {
                return true;
            }
            if let Some(pos) = trimmed.find('=') {
                let k = trimmed[..pos].trim();
                return k != key;
            }
            true
        })
        .collect();

    let result = lines.join("\n") + "\n";
    match std::fs::write(&resolved, result) {
        Ok(_) => json!({"success": true}).to_string(),
        Err(e) => err(e),
    }
}

fn env_get_all(base: &Path, file: String) -> String {
    env_load(base, file)
}

fn env_save(base: &Path, file: String, json_str: String) -> String {
    let resolved = match resolve(base, file) {
        Ok(p) => p,
        Err(e) => return err(e),
    };

    let obj: serde_json::Value = match serde_json::from_str(&json_str) {
        Ok(v) => v,
        Err(e) => return err(format!("Invalid JSON: {}", e)),
    };

    let map_obj = match obj.as_object() {
        Some(m) => m,
        None => return err("Expected a JSON object"),
    };

    let mut map = BTreeMap::new();
    for (k, v) in map_obj {
        let val = match v {
            serde_json::Value::String(s) => s.clone(),
            other => other.to_string(),
        };
        map.insert(k.clone(), val);
    }

    let content = serialize_env(&map);
    match std::fs::write(&resolved, content) {
        Ok(_) => json!({"success": true}).to_string(),
        Err(e) => err(e),
    }
}
