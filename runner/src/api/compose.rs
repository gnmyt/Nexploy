use anyhow::{Context as AnyhowContext, Result};
use quick_js::Context;
use serde_json::json;
use std::path::{Path, PathBuf};

use crate::utils::path::resolve_sandboxed_path;

macro_rules! add_yaml_callback {
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
    ($ctx:expr, $name:expr, $path:expr, $handler:expr, 4) => {{
        let p = $path.clone();
        $ctx.add_callback($name, move |a: String, b: String, c: String, d: String| {
            $handler(&p, a, b, c, d)
        })
        .context(concat!("Failed to add ", stringify!($name)))?;
    }};
}

pub fn register(ctx: &Context, base_path: PathBuf) -> Result<()> {
    add_yaml_callback!(ctx, "_composeGetEnv", base_path, compose_get_env, 2);
    add_yaml_callback!(ctx, "_composeSetEnv", base_path, compose_set_env, 4);
    add_yaml_callback!(ctx, "_composeRemoveEnv", base_path, compose_remove_env, 3);
    add_yaml_callback!(ctx, "_composeGetAllEnv", base_path, compose_get_all_env, 2);
    add_yaml_callback!(ctx, "_composeSetAllEnv", base_path, compose_set_all_env, 3);
    add_yaml_callback!(ctx, "_composeGetPorts", base_path, compose_get_ports, 2);
    add_yaml_callback!(ctx, "_composeSetPort", base_path, compose_set_port, 4);
    add_yaml_callback!(ctx, "_composeGetImage", base_path, compose_get_image, 2);
    add_yaml_callback!(ctx, "_composeSetImage", base_path, compose_set_image, 3);
    add_yaml_callback!(ctx, "_composeGetServices", base_path, compose_get_services);

    ctx.eval(COMPOSE_JS)
        .context("Failed to create compose object")?;
    Ok(())
}

const COMPOSE_JS: &str = r#"
var compose = {
    getEnv: function(file, service, key) {
        var d = JSON.parse(_composeGetEnv(file || 'docker-compose.yml', JSON.stringify({service: service, key: key})));
        if (!d.success) throw new Error('compose.getEnv failed: ' + d.error);
        return d.value;
    },
    setEnv: function(file, service, key, value) {
        var d = JSON.parse(_composeSetEnv(file || 'docker-compose.yml', service, key, String(value)));
        if (!d.success) throw new Error('compose.setEnv failed: ' + d.error);
        return true;
    },
    removeEnv: function(file, service, key) {
        var d = JSON.parse(_composeRemoveEnv(file || 'docker-compose.yml', service, key));
        if (!d.success) throw new Error('compose.removeEnv failed: ' + d.error);
        return true;
    },
    getAllEnv: function(file, service) {
        var d = JSON.parse(_composeGetAllEnv(file || 'docker-compose.yml', service));
        if (!d.success) throw new Error('compose.getAllEnv failed: ' + d.error);
        return d.values;
    },
    setAllEnv: function(file, service, envObj) {
        var d = JSON.parse(_composeSetAllEnv(file || 'docker-compose.yml', service, JSON.stringify(envObj)));
        if (!d.success) throw new Error('compose.setAllEnv failed: ' + d.error);
        return true;
    },
    getPorts: function(file, service) {
        var d = JSON.parse(_composeGetPorts(file || 'docker-compose.yml', service));
        if (!d.success) throw new Error('compose.getPorts failed: ' + d.error);
        return d.ports;
    },
    setPort: function(file, service, containerPort, hostPort) {
        var d = JSON.parse(_composeSetPort(file || 'docker-compose.yml', service, String(containerPort), String(hostPort)));
        if (!d.success) throw new Error('compose.setPort failed: ' + d.error);
        return true;
    },
    getImage: function(file, service) {
        var d = JSON.parse(_composeGetImage(file || 'docker-compose.yml', service));
        if (!d.success) throw new Error('compose.getImage failed: ' + d.error);
        return d.image;
    },
    setImage: function(file, service, image) {
        var d = JSON.parse(_composeSetImage(file || 'docker-compose.yml', service, image));
        if (!d.success) throw new Error('compose.setImage failed: ' + d.error);
        return true;
    },
    getServices: function(file) {
        var d = JSON.parse(_composeGetServices(file || 'docker-compose.yml'));
        if (!d.success) throw new Error('compose.getServices failed: ' + d.error);
        return d.services;
    }
};
"#;

fn err(e: impl std::fmt::Display) -> String {
    json!({"success": false, "error": e.to_string()}).to_string()
}

fn resolve(base: &Path, path: String) -> Result<PathBuf, String> {
    resolve_sandboxed_path(base, path)
}

fn read_compose(base: &Path, file: &str) -> Result<(PathBuf, String), String> {
    let resolved = resolve(base, file.to_string())?;
    let content = std::fs::read_to_string(&resolved).map_err(|e| e.to_string())?;
    Ok((resolved, content))
}

fn find_service_block(lines: &[&str], service: &str) -> Option<(usize, usize, usize)> {
    let services_line = lines.iter().position(|l| l.trim() == "services:")?;
    let services_indent = lines[services_line].len() - lines[services_line].trim_start().len();
    let svc_indent = services_indent + 2;

    let target = format!("{}:", service);
    let mut svc_start = None;
    for i in (services_line + 1)..lines.len() {
        let line = lines[i];
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let indent = line.len() - line.trim_start().len();
        if indent <= services_indent && !trimmed.is_empty() {
            break;
        }
        if indent == svc_indent && trimmed == target {
            svc_start = Some(i);
            break;
        }
    }

    let start = svc_start?;
    let mut end = lines.len();
    for i in (start + 1)..lines.len() {
        let line = lines[i];
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let indent = line.len() - line.trim_start().len();
        if indent <= svc_indent {
            end = i;
            break;
        }
    }

    Some((start, end, svc_indent))
}

fn find_env_block(
    lines: &[&str],
    svc_start: usize,
    svc_end: usize,
    svc_indent: usize,
) -> Option<(usize, usize, bool)> {
    let prop_indent = svc_indent + 2;
    let value_indent = prop_indent + 2;

    for i in (svc_start + 1)..svc_end {
        let line = lines[i];
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let indent = line.len() - line.trim_start().len();
        if indent == prop_indent && (trimmed == "environment:" || trimmed.starts_with("environment:")) {

            let mut env_end = svc_end;
            let mut is_list = false;
            for j in (i + 1)..svc_end {
                let eline = lines[j];
                let etrimmed = eline.trim();
                if etrimmed.is_empty() || etrimmed.starts_with('#') {
                    continue;
                }
                let eindent = eline.len() - eline.trim_start().len();
                if eindent <= prop_indent {
                    env_end = j;
                    break;
                }
                if eindent >= value_indent && etrimmed.starts_with("- ") {
                    is_list = true;
                }
            }
            return Some((i, env_end, is_list));
        }
    }
    None
}

fn compose_get_env(base: &Path, file: String, params_json: String) -> String {
    let params: serde_json::Value = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return err(format!("Invalid params: {}", e)),
    };
    let service = params["service"].as_str().unwrap_or("");
    let key = params["key"].as_str().unwrap_or("");

    let (_, content) = match read_compose(base, &file) {
        Ok(v) => v,
        Err(e) => return err(e),
    };

    let lines: Vec<&str> = content.lines().collect();
    let (svc_start, svc_end, svc_indent) = match find_service_block(&lines, service) {
        Some(v) => v,
        None => return json!({"success": true, "value": null}).to_string(),
    };

    let (env_start, env_end, is_list) =
        match find_env_block(&lines, svc_start, svc_end, svc_indent) {
            Some(v) => v,
            None => return json!({"success": true, "value": null}).to_string(),
        };

    for i in (env_start + 1)..env_end {
        let trimmed = lines[i].trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if is_list {
            if let Some(entry) = trimmed.strip_prefix("- ") {
                if let Some(pos) = entry.find('=') {
                    let k = entry[..pos].trim();
                    if k == key {
                        let v = entry[pos + 1..].trim().to_string();
                        return json!({"success": true, "value": unquote(&v)}).to_string();
                    }
                }
            }
        } else {
            if let Some(pos) = trimmed.find(':') {
                let k = trimmed[..pos].trim();
                if k == key {
                    let v = trimmed[pos + 1..].trim().to_string();
                    return json!({"success": true, "value": unquote(&v)}).to_string();
                }
            }
        }
    }

    json!({"success": true, "value": null}).to_string()
}

fn compose_set_env(base: &Path, file: String, service: String, key: String, value: String) -> String {
    let (resolved, content) = match read_compose(base, &file) {
        Ok(v) => v,
        Err(e) => return err(e),
    };

    let mut lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();

    let (svc_start, svc_end, svc_indent) = match find_service_block(
        &lines.iter().map(|s| s.as_str()).collect::<Vec<_>>(),
        &service,
    ) {
        Some(v) => v,
        None => return err(format!("Service '{}' not found", service)),
    };

    let lines_ref: Vec<&str> = lines.iter().map(|s| s.as_str()).collect();
    let prop_indent = svc_indent + 2;
    let value_indent = prop_indent + 2;
    let indent_str = " ".repeat(value_indent);

    match find_env_block(&lines_ref, svc_start, svc_end, svc_indent) {
        Some((env_start, env_end, is_list)) => {
            let mut found = false;
            for i in (env_start + 1)..env_end {
                let trimmed = lines[i].trim().to_string();
                if trimmed.is_empty() || trimmed.starts_with('#') {
                    continue;
                }
                if is_list {
                    if let Some(entry) = trimmed.strip_prefix("- ") {
                        if let Some(pos) = entry.find('=') {
                            let k = entry[..pos].trim();
                            if k == key {
                                lines[i] = format!("{}- {}={}", indent_str, key, value);
                                found = true;
                                break;
                            }
                        }
                    }
                } else {
                    if let Some(pos) = trimmed.find(':') {
                        let k = trimmed[..pos].trim();
                        if k == key {
                            lines[i] = format!("{}{}: {}", indent_str, key, value);
                            found = true;
                            break;
                        }
                    }
                }
            }
            if !found {
                let new_line = if is_list {
                    format!("{}- {}={}", indent_str, key, value)
                } else {
                    format!("{}{}: {}", indent_str, key, value)
                };
                lines.insert(env_end, new_line);
            }
        }
        None => {
            let env_line = format!("{}environment:", " ".repeat(prop_indent));
            let entry_line = format!("{}- {}={}", indent_str, key, value);

            lines.insert(svc_start + 1, entry_line);
            lines.insert(svc_start + 1, env_line);
        }
    }

    let result = lines.join("\n") + "\n";
    match std::fs::write(&resolved, result) {
        Ok(_) => json!({"success": true}).to_string(),
        Err(e) => err(e),
    }
}

fn compose_remove_env(base: &Path, file: String, service: String, key: String) -> String {
    let (resolved, content) = match read_compose(base, &file) {
        Ok(v) => v,
        Err(e) => return err(e),
    };

    let mut lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();
    let lines_ref: Vec<&str> = lines.iter().map(|s| s.as_str()).collect();

    let (svc_start, svc_end, svc_indent) = match find_service_block(&lines_ref, &service) {
        Some(v) => v,
        None => return err(format!("Service '{}' not found", service)),
    };

    let (env_start, env_end, is_list) =
        match find_env_block(&lines_ref, svc_start, svc_end, svc_indent) {
            Some(v) => v,
            None => return json!({"success": true}).to_string(),
        };

    let mut remove_idx = None;
    for i in (env_start + 1)..env_end {
        let trimmed = lines[i].trim().to_string();
        if is_list {
            if let Some(entry) = trimmed.strip_prefix("- ") {
                if let Some(pos) = entry.find('=') {
                    if entry[..pos].trim() == key {
                        remove_idx = Some(i);
                        break;
                    }
                }
            }
        } else {
            if let Some(pos) = trimmed.find(':') {
                if trimmed[..pos].trim() == key {
                    remove_idx = Some(i);
                    break;
                }
            }
        }
    }

    if let Some(idx) = remove_idx {
        lines.remove(idx);
        let result = lines.join("\n") + "\n";
        match std::fs::write(&resolved, result) {
            Ok(_) => json!({"success": true}).to_string(),
            Err(e) => err(e),
        }
    } else {
        json!({"success": true}).to_string()
    }
}

fn compose_get_all_env(base: &Path, file: String, service: String) -> String {
    let (_, content) = match read_compose(base, &file) {
        Ok(v) => v,
        Err(e) => return err(e),
    };

    let lines: Vec<&str> = content.lines().collect();
    let (svc_start, svc_end, svc_indent) = match find_service_block(&lines, &service) {
        Some(v) => v,
        None => return json!({"success": true, "values": {}}).to_string(),
    };

    let (env_start, env_end, is_list) =
        match find_env_block(&lines, svc_start, svc_end, svc_indent) {
            Some(v) => v,
            None => return json!({"success": true, "values": {}}).to_string(),
        };

    let mut map = serde_json::Map::new();
    for i in (env_start + 1)..env_end {
        let trimmed = lines[i].trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if is_list {
            if let Some(entry) = trimmed.strip_prefix("- ") {
                if let Some(pos) = entry.find('=') {
                    let k = entry[..pos].trim().to_string();
                    let v = unquote(&entry[pos + 1..].trim().to_string());
                    map.insert(k, json!(v));
                }
            }
        } else {
            if let Some(pos) = trimmed.find(':') {
                let k = trimmed[..pos].trim().to_string();
                let v = unquote(&trimmed[pos + 1..].trim().to_string());
                map.insert(k, json!(v));
            }
        }
    }

    json!({"success": true, "values": map}).to_string()
}

fn compose_set_all_env(base: &Path, file: String, service: String, json_str: String) -> String {
    let obj: serde_json::Value = match serde_json::from_str(&json_str) {
        Ok(v) => v,
        Err(e) => return err(format!("Invalid JSON: {}", e)),
    };

    let map_obj = match obj.as_object() {
        Some(m) => m,
        None => return err("Expected a JSON object"),
    };

    let (resolved, content) = match read_compose(base, &file) {
        Ok(v) => v,
        Err(e) => return err(e),
    };

    let mut lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();
    let lines_ref: Vec<&str> = lines.iter().map(|s| s.as_str()).collect();

    let (svc_start, svc_end, svc_indent) = match find_service_block(&lines_ref, &service) {
        Some(v) => v,
        None => return err(format!("Service '{}' not found", service)),
    };

    let prop_indent = svc_indent + 2;
    let value_indent = prop_indent + 2;
    let indent_str = " ".repeat(value_indent);

    match find_env_block(&lines_ref, svc_start, svc_end, svc_indent) {
        Some((env_start, env_end, _)) => {
            for _ in (env_start + 1)..env_end {
                if env_start + 1 < lines.len() {
                    let trimmed = lines[env_start + 1].trim().to_string();
                    let indent = lines[env_start + 1].len()
                        - lines[env_start + 1].trim_start().len();
                    if indent > prop_indent
                        || trimmed.is_empty()
                        || trimmed.starts_with('#')
                    {
                        lines.remove(env_start + 1);
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }
            let mut insert_at = env_start + 1;
            for (k, v) in map_obj {
                let val = match v {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                lines.insert(insert_at, format!("{}- {}={}", indent_str, k, val));
                insert_at += 1;
            }
        }
        None => {
            let mut insert_at = svc_start + 1;
            lines.insert(
                insert_at,
                format!("{}environment:", " ".repeat(prop_indent)),
            );
            insert_at += 1;
            for (k, v) in map_obj {
                let val = match v {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                lines.insert(insert_at, format!("{}- {}={}", indent_str, k, val));
                insert_at += 1;
            }
        }
    }

    let result = lines.join("\n") + "\n";
    match std::fs::write(&resolved, result) {
        Ok(_) => json!({"success": true}).to_string(),
        Err(e) => err(e),
    }
}

fn compose_get_ports(base: &Path, file: String, service: String) -> String {
    let (_, content) = match read_compose(base, &file) {
        Ok(v) => v,
        Err(e) => return err(e),
    };

    let lines: Vec<&str> = content.lines().collect();
    let (svc_start, svc_end, svc_indent) = match find_service_block(&lines, &service) {
        Some(v) => v,
        None => return json!({"success": true, "ports": []}).to_string(),
    };

    let prop_indent = svc_indent + 2;
    let mut ports = Vec::new();

    let mut in_ports = false;
    for i in (svc_start + 1)..svc_end {
        let line = lines[i];
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let indent = line.len() - line.trim_start().len();

        if indent == prop_indent && trimmed.starts_with("ports:") {
            in_ports = true;
            continue;
        }
        if indent <= prop_indent && in_ports {
            break;
        }
        if in_ports {
            if let Some(entry) = trimmed.strip_prefix("- ") {
                let clean = entry.trim_matches('"').trim_matches('\'');
                if let Some(colon) = clean.rfind(':') {
                    let host = &clean[..colon];
                    let container = &clean[colon + 1..];
                    ports.push(json!({"host": host, "container": container}));
                } else {
                    ports.push(json!({"host": clean, "container": clean}));
                }
            }
        }
    }

    json!({"success": true, "ports": ports}).to_string()
}

fn compose_set_port(
    base: &Path,
    file: String,
    service: String,
    container_port: String,
    host_port: String,
) -> String {
    let (resolved, content) = match read_compose(base, &file) {
        Ok(v) => v,
        Err(e) => return err(e),
    };

    let mut lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();
    let lines_ref: Vec<&str> = lines.iter().map(|s| s.as_str()).collect();

    let (svc_start, svc_end, svc_indent) = match find_service_block(&lines_ref, &service) {
        Some(v) => v,
        None => return err(format!("Service '{}' not found", service)),
    };

    let prop_indent = svc_indent + 2;
    let value_indent = prop_indent + 2;

    let mut in_ports = false;
    let mut found = false;

    for i in (svc_start + 1)..svc_end {
        let line = lines[i].clone();
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let indent = line.len() - line.trim_start().len();

        if indent == prop_indent && trimmed.starts_with("ports:") {
            in_ports = true;
            continue;
        }
        if indent <= prop_indent && in_ports {
            break;
        }
        if in_ports {
            if let Some(entry) = trimmed.strip_prefix("- ") {
                let clean = entry.trim_matches('"').trim_matches('\'');
                if let Some(colon) = clean.rfind(':') {
                    let cp = &clean[colon + 1..];
                    if cp == container_port {
                        lines[i] = format!(
                            "{}\"{}:{}\"",
                            " ".repeat(value_indent) + "- ",
                            host_port,
                            container_port
                        );
                        found = true;
                        break;
                    }
                }
            }
        }
    }

    if !found {
        let lines_ref2: Vec<&str> = lines.iter().map(|s| s.as_str()).collect();
        let mut ports_line = None;
        let mut ports_end = svc_end;

        for i in (svc_start + 1)..svc_end.min(lines.len()) {
            let line = &lines_ref2[i];
            let trimmed = line.trim();
            let indent = line.len() - line.trim_start().len();
            if indent == prop_indent && trimmed.starts_with("ports:") {
                ports_line = Some(i);
                for j in (i + 1)..svc_end.min(lines.len()) {
                    let jline = lines_ref2[j];
                    let jtrimmed = jline.trim();
                    if jtrimmed.is_empty() || jtrimmed.starts_with('#') {
                        continue;
                    }
                    let jindent = jline.len() - jline.trim_start().len();
                    if jindent <= prop_indent {
                        ports_end = j;
                        break;
                    }
                }
                break;
            }
        }

        let new_entry = format!(
            "{}- \"{}:{}\"",
            " ".repeat(value_indent),
            host_port,
            container_port
        );

        match ports_line {
            Some(_pl) => {
                lines.insert(ports_end.min(lines.len()), new_entry);
            }
            None => {
                lines.insert(
                    svc_start + 1,
                    format!("{}ports:", " ".repeat(prop_indent)),
                );
                lines.insert(svc_start + 2, new_entry);
            }
        }
    }

    let result = lines.join("\n") + "\n";
    match std::fs::write(&resolved, result) {
        Ok(_) => json!({"success": true}).to_string(),
        Err(e) => err(e),
    }
}

fn compose_get_image(base: &Path, file: String, service: String) -> String {
    let (_, content) = match read_compose(base, &file) {
        Ok(v) => v,
        Err(e) => return err(e),
    };

    let lines: Vec<&str> = content.lines().collect();
    let (svc_start, svc_end, svc_indent) = match find_service_block(&lines, &service) {
        Some(v) => v,
        None => return json!({"success": true, "image": null}).to_string(),
    };

    let prop_indent = svc_indent + 2;
    for i in (svc_start + 1)..svc_end {
        let line = lines[i];
        let trimmed = line.trim();
        let indent = line.len() - line.trim_start().len();
        if indent == prop_indent && trimmed.starts_with("image:") {
            let img = trimmed[6..].trim();
            return json!({"success": true, "image": unquote(&img.to_string())}).to_string();
        }
    }

    json!({"success": true, "image": null}).to_string()
}

fn compose_set_image(base: &Path, file: String, service: String, image: String) -> String {
    let (resolved, content) = match read_compose(base, &file) {
        Ok(v) => v,
        Err(e) => return err(e),
    };

    let mut lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();
    let lines_ref: Vec<&str> = lines.iter().map(|s| s.as_str()).collect();

    let (svc_start, svc_end, svc_indent) = match find_service_block(&lines_ref, &service) {
        Some(v) => v,
        None => return err(format!("Service '{}' not found", service)),
    };

    let prop_indent = svc_indent + 2;
    let mut found = false;

    for i in (svc_start + 1)..svc_end {
        let line = &lines[i];
        let indent = line.len() - line.trim_start().len();
        if indent == prop_indent && line.trim().starts_with("image:") {
            lines[i] = format!("{}image: {}", " ".repeat(prop_indent), image);
            found = true;
            break;
        }
    }

    if !found {
        lines.insert(
            svc_start + 1,
            format!("{}image: {}", " ".repeat(prop_indent), image),
        );
    }

    let result = lines.join("\n") + "\n";
    match std::fs::write(&resolved, result) {
        Ok(_) => json!({"success": true}).to_string(),
        Err(e) => err(e),
    }
}

fn compose_get_services(base: &Path, file: String) -> String {
    let (_, content) = match read_compose(base, &file) {
        Ok(v) => v,
        Err(e) => return err(e),
    };

    let lines: Vec<&str> = content.lines().collect();
    let services_line = lines.iter().position(|l| l.trim() == "services:");
    let services_line = match services_line {
        Some(l) => l,
        None => return json!({"success": true, "services": []}).to_string(),
    };

    let services_indent = lines[services_line].len() - lines[services_line].trim_start().len();
    let svc_indent = services_indent + 2;
    let mut services = Vec::new();

    for i in (services_line + 1)..lines.len() {
        let line = lines[i];
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let indent = line.len() - line.trim_start().len();
        if indent <= services_indent {
            break;
        }
        if indent == svc_indent && trimmed.ends_with(':') {
            services.push(trimmed.trim_end_matches(':'));
        }
    }

    json!({"success": true, "services": services}).to_string()
}

fn unquote(s: &str) -> String {
    let s = s.trim();
    if (s.starts_with('"') && s.ends_with('"')) || (s.starts_with('\'') && s.ends_with('\'')) {
        s[1..s.len() - 1].to_string()
    } else {
        s.to_string()
    }
}
