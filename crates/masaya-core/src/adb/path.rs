//! Finding the `adb` executable. Ported from the removed Electron app's `adb-path.resolver.ts`.
//!
//! GUI apps often miss the shell's PATH entries, so besides `PATH` the lookup also tries the usual
//! Android SDK and package-manager locations.

use std::ffi::OsString;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    Windows,
    MacOs,
    Linux,
}

impl Platform {
    pub const fn current() -> Self {
        if cfg!(windows) {
            Self::Windows
        } else if cfg!(target_os = "macos") {
            Self::MacOs
        } else {
            Self::Linux
        }
    }

    pub const fn adb_executable(self) -> &'static str {
        match self {
            Self::Windows => "adb.exe",
            _ => "adb",
        }
    }

    fn system_bin_dirs(self) -> &'static [&'static str] {
        match self {
            Self::MacOs => &["/opt/homebrew/bin", "/usr/local/bin"],
            Self::Windows => &["C:\\platform-tools"],
            Self::Linux => &["/usr/local/bin", "/usr/bin"],
        }
    }
}

/// The environment a lookup reads, so it can be tested without touching the real one.
#[derive(Debug, Clone, Default)]
pub struct PathEnv {
    pub platform: Option<Platform>,
    pub adb_path: Option<OsString>,
    pub android_home: Option<OsString>,
    pub android_sdk_root: Option<OsString>,
    pub local_app_data: Option<OsString>,
    pub home: Option<PathBuf>,
    pub path: Option<OsString>,
}

impl PathEnv {
    pub fn from_process() -> Self {
        Self {
            platform: Some(Platform::current()),
            adb_path: std::env::var_os("ADB_PATH"),
            android_home: std::env::var_os("ANDROID_HOME"),
            android_sdk_root: std::env::var_os("ANDROID_SDK_ROOT"),
            local_app_data: std::env::var_os("LOCALAPPDATA"),
            home: std::env::home_dir(),
            path: std::env::var_os("PATH"),
        }
    }

    fn platform(&self) -> Platform {
        self.platform.unwrap_or(Platform::current())
    }

    fn sdk_roots(&self) -> Vec<PathBuf> {
        let mut roots: Vec<PathBuf> = Vec::new();
        roots.extend(self.android_home.iter().map(PathBuf::from));
        roots.extend(self.android_sdk_root.iter().map(PathBuf::from));
        if let Some(home) = &self.home {
            roots.push(home.join("Library").join("Android").join("sdk"));
            roots.push(home.join("Android").join("Sdk"));
        }
        roots.extend(
            self.local_app_data
                .iter()
                .map(|dir| Path::new(dir).join("Android").join("Sdk")),
        );
        roots.retain(|root| !root.as_os_str().is_empty());
        roots
    }
}

/// `ADB_PATH` may point at the executable, its folder, or an SDK root.
fn to_adb_executable(candidate: &Path, platform: Platform) -> PathBuf {
    let executable = platform.adb_executable();
    let name = candidate.file_name().and_then(|name| name.to_str());
    match name {
        Some(name) if name == executable => candidate.to_path_buf(),
        Some("platform-tools") => candidate.join(executable),
        _ => candidate.join("platform-tools").join(executable),
    }
}

/// Every place `adb` may live, most specific first and without repeats. `custom` (chosen by the
/// user in the app) wins over `ADB_PATH` and the usual locations.
pub fn candidate_paths(env: &PathEnv, custom: Option<&Path>) -> Vec<PathBuf> {
    let platform = env.platform();
    let executable = platform.adb_executable();

    let mut dirs: Vec<PathBuf> = env
        .sdk_roots()
        .into_iter()
        .map(|root| root.join("platform-tools"))
        .collect();
    if let Some(path) = &env.path {
        dirs.extend(std::env::split_paths(path));
    }
    dirs.extend(platform.system_bin_dirs().iter().map(PathBuf::from));

    let mut candidates: Vec<PathBuf> = Vec::new();
    candidates.extend(custom.map(Path::to_path_buf));
    candidates.extend(
        env.adb_path
            .iter()
            .map(|adb_path| to_adb_executable(Path::new(adb_path), platform)),
    );
    candidates.extend(
        dirs.into_iter()
            .filter(|dir| !dir.as_os_str().is_empty())
            .map(|dir| dir.join(executable)),
    );

    let mut seen = std::collections::HashSet::new();
    candidates.retain(|candidate| seen.insert(candidate.clone()));
    candidates
}

#[cfg(unix)]
fn is_executable_file(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(path)
        .map(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable_file(path: &Path) -> bool {
    std::fs::metadata(path)
        .map(|meta| meta.is_file())
        .unwrap_or(false)
}

/// The first candidate that exists and can run, or `None` when `adb` is not installed.
pub async fn resolve_adb_path(env: PathEnv, custom: Option<PathBuf>) -> Option<PathBuf> {
    // Probing the disk blocks, so it runs off the async threads.
    tokio::task::spawn_blocking(move || {
        candidate_paths(&env, custom.as_deref())
            .into_iter()
            .find(|candidate| is_executable_file(candidate))
    })
    .await
    .ok()
    .flatten()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn linux_env() -> PathEnv {
        PathEnv {
            platform: Some(Platform::Linux),
            home: Some(PathBuf::from("/home/ana")),
            path: Some(OsString::from("/usr/bin:/opt/tools")),
            ..PathEnv::default()
        }
    }

    #[test]
    fn custom_path_comes_first_then_adb_path_then_sdk_then_path_then_system_dirs() {
        let env = PathEnv {
            adb_path: Some("/sdk".into()),
            android_home: Some("/android-home".into()),
            ..linux_env()
        };
        let candidates = candidate_paths(&env, Some(Path::new("/picked/adb")));
        let as_strings: Vec<_> = candidates
            .iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect();
        assert_eq!(as_strings[0], "/picked/adb");
        assert_eq!(as_strings[1], "/sdk/platform-tools/adb");
        assert_eq!(as_strings[2], "/android-home/platform-tools/adb");
        assert!(as_strings.contains(&"/home/ana/Android/Sdk/platform-tools/adb".to_owned()));
        assert!(as_strings.contains(&"/opt/tools/adb".to_owned()));
        assert!(as_strings.contains(&"/usr/local/bin/adb".to_owned()));
    }

    #[test]
    fn adb_path_may_name_the_executable_its_folder_or_an_sdk_root() {
        let linux = Platform::Linux;
        assert_eq!(
            to_adb_executable(Path::new("/x/adb"), linux),
            PathBuf::from("/x/adb")
        );
        assert_eq!(
            to_adb_executable(Path::new("/x/platform-tools"), linux),
            PathBuf::from("/x/platform-tools/adb")
        );
        assert_eq!(
            to_adb_executable(Path::new("/x/sdk"), linux),
            PathBuf::from("/x/sdk/platform-tools/adb")
        );
    }

    #[test]
    fn candidates_have_no_repeats() {
        // /usr/bin is both in PATH and a system dir.
        let candidates = candidate_paths(&linux_env(), None);
        let count = candidates
            .iter()
            .filter(|p| p.ends_with("usr/bin/adb"))
            .count();
        assert_eq!(count, 1);
    }

    #[test]
    fn windows_looks_for_adb_exe_in_the_local_sdk() {
        let env = PathEnv {
            platform: Some(Platform::Windows),
            local_app_data: Some("C:\\Users\\ana\\AppData\\Local".into()),
            ..PathEnv::default()
        };
        let candidates = candidate_paths(&env, None);
        assert!(candidates.iter().any(
            |p| p.ends_with("platform-tools/adb.exe") || p.ends_with("platform-tools\\adb.exe")
        ));
        assert!(candidates
            .iter()
            .all(|p| p.to_string_lossy().ends_with("adb.exe")));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn resolves_the_first_executable_candidate() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("masaya-path-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let plain = dir.join("not-exec");
        let exec = dir.join("adb");
        std::fs::write(&plain, "x").unwrap();
        std::fs::write(&exec, "#!/bin/sh\n").unwrap();
        std::fs::set_permissions(&exec, std::fs::Permissions::from_mode(0o755)).unwrap();

        let env = PathEnv {
            platform: Some(Platform::Linux),
            path: Some(dir.clone().into()),
            ..PathEnv::default()
        };
        assert_eq!(
            resolve_adb_path(env.clone(), None).await,
            Some(exec.clone())
        );
        // A custom path that is not executable is skipped.
        assert_eq!(resolve_adb_path(env, Some(plain)).await, Some(exec));
        std::fs::remove_dir_all(dir).ok();
    }
}
