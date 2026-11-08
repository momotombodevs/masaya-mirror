//! Where `scrcpy-server.jar` is: the bundled copy in a release, the repository's in development.

use std::path::{Path, PathBuf};

/// Points at a jar of the user's choosing (a newer server, a test build).
pub const JAR_ENV: &str = "MASAYA_SCRCPY_SERVER";

const JAR: &str = "scrcpy-server/scrcpy-server.jar";

/// The places to look, in order: the environment's choice, the app bundle's `Resources`
/// (`Masaya.app/Contents/MacOS/<exe>` → `Contents/Resources/...`), then the repository's
/// `resources/`, where `scripts/setup-scrcpy.sh` downloads it.
pub fn jar_candidates(
    env: Option<PathBuf>,
    exe: Option<&Path>,
    manifest_dir: &Path,
) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    candidates.extend(env.filter(|path| !path.as_os_str().is_empty()));
    if let Some(contents) = exe.and_then(Path::parent).and_then(Path::parent) {
        candidates.push(contents.join("Resources").join(JAR));
    }
    candidates.push(manifest_dir.join("../../resources").join(JAR));
    candidates
}

/// The first candidate that exists, or the last one tried (to tell the user where it should be).
pub fn pick(candidates: &[PathBuf]) -> Result<PathBuf, PathBuf> {
    if let Some(found) = candidates.iter().find(|path| path.is_file()) {
        return Ok(found.clone());
    }
    Err(candidates
        .last()
        .cloned()
        .unwrap_or_else(|| PathBuf::from(JAR)))
}

/// The jar for this process.
pub fn server_jar() -> Result<PathBuf, PathBuf> {
    let exe = std::env::current_exe().ok();
    pick(&jar_candidates(
        std::env::var_os(JAR_ENV).map(PathBuf::from),
        exe.as_deref(),
        Path::new(env!("CARGO_MANIFEST_DIR")),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn looks_in_the_environment_then_the_bundle_then_the_repository() {
        let candidates = jar_candidates(
            Some(PathBuf::from("/tmp/custom.jar")),
            Some(Path::new("/Applications/Masaya.app/Contents/MacOS/masaya")),
            Path::new("/repo/crates/masaya-nsh"),
        );
        assert_eq!(
            candidates,
            [
                PathBuf::from("/tmp/custom.jar"),
                PathBuf::from(
                    "/Applications/Masaya.app/Contents/Resources/scrcpy-server/scrcpy-server.jar"
                ),
                PathBuf::from(
                    "/repo/crates/masaya-nsh/../../resources/scrcpy-server/scrcpy-server.jar"
                ),
            ]
        );
    }

    #[test]
    fn an_empty_environment_value_is_ignored() {
        let candidates = jar_candidates(Some(PathBuf::new()), None, Path::new("/repo/x"));
        assert_eq!(candidates.len(), 1);
    }

    #[test]
    fn picks_the_first_that_exists_or_names_the_last() {
        let dir = std::env::temp_dir().join(format!("masaya-jar-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let present = dir.join("present.jar");
        std::fs::write(&present, b"jar").unwrap();
        let missing = dir.join("missing.jar");

        assert_eq!(
            pick(&[missing.clone(), present.clone()]),
            Ok(present.clone())
        );
        assert_eq!(pick(std::slice::from_ref(&missing)), Err(missing));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
