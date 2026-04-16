use std::path::{Path, PathBuf};

pub fn resolve_sandboxed_path(base: &Path, user_path: String) -> Result<PathBuf, String> {
    let clean = user_path.replace("..", "").replace("//", "/");
    let full = base.join(&clean);

    let resolved = if full.exists() {
        full.canonicalize().map_err(|_| "Failed to resolve path")?
    } else if let Some(parent) = full.parent().filter(|p| p.exists()) {
        let canonical = parent
            .canonicalize()
            .map_err(|_| "Failed to resolve parent path")?;
        if !canonical.starts_with(base) {
            return Err("Path outside allowed directory".into());
        }
        canonical.join(full.file_name().ok_or("Invalid path")?)
    } else {
        full
    };

    if !resolved.starts_with(base) {
        return Err("Path escape attempt detected".into());
    }
    Ok(resolved)
}
