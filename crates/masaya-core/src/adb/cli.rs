//! One-shot adb commands through the `adb` executable. Ports `AdbService` from `adb.service.ts`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Mutex;
use std::time::Duration;

use futures_util::future::join_all;
use tokio::process::Command;

use super::device::{
    parse_adb_devices_output, parse_mdns_services, AndroidDevice, DeviceSettingKey, DeviceSettings,
    DeviceStatus, MdnsService,
};
use super::device_name::{device_name_shell_command, friendly_model_name, parse_device_name};
use super::path::{resolve_adb_path, PathEnv};
use crate::error::AdbError;
use crate::i18n::{Locale, Msg};

const INSTALL_TIMEOUT: Duration = Duration::from_secs(180);
const NETWORK_TIMEOUT: Duration = Duration::from_secs(20);
const DEVICE_NAME_TIMEOUT: Duration = Duration::from_secs(5);
const VERSION_TIMEOUT: Duration = Duration::from_secs(5);

/// Last non-empty line, which is where adb puts its verdict.
fn last_line(text: &str) -> &str {
    text.trim().lines().next_back().map_or("", str::trim)
}

#[derive(Debug)]
pub struct AdbCli {
    env: PathEnv,
    locale: Mutex<Locale>,
    custom_path: Mutex<Option<PathBuf>>,
    resolved: Mutex<Option<PathBuf>>,
    /// Marketing names by device id. The list refreshes every few seconds, so each phone is asked
    /// once per connection; failed lookups are dropped and retried on the next refresh.
    device_names: Mutex<HashMap<String, Option<String>>>,
}

impl AdbCli {
    pub fn new(locale: Locale) -> Self {
        Self::with_env(locale, PathEnv::from_process())
    }

    pub fn with_env(locale: Locale, env: PathEnv) -> Self {
        Self {
            env,
            locale: Mutex::new(locale),
            custom_path: Mutex::new(None),
            resolved: Mutex::new(None),
            device_names: Mutex::new(HashMap::new()),
        }
    }

    pub fn locale(&self) -> Locale {
        *self.locale.lock().expect("locale lock")
    }

    pub fn set_locale(&self, locale: Locale) {
        *self.locale.lock().expect("locale lock") = locale;
    }

    /// Sets (or clears) the `adb` the user picked in the app and forgets the cached lookup.
    pub fn set_custom_path(&self, custom: Option<PathBuf>) {
        *self.custom_path.lock().expect("path lock") = custom;
        *self.resolved.lock().expect("path lock") = None;
    }

    pub async fn executable_path(&self) -> Option<PathBuf> {
        if let Some(found) = self.resolved.lock().expect("path lock").clone() {
            return Some(found);
        }
        let custom = self.custom_path.lock().expect("path lock").clone();
        let found = resolve_adb_path(self.env.clone(), custom).await;
        *self.resolved.lock().expect("path lock") = found.clone();
        found
    }

    /// Runs `adb version` on a candidate executable to be sure it really is adb.
    pub async fn verify_executable(candidate: &Path) -> bool {
        run_executable(candidate, &["version"], VERSION_TIMEOUT)
            .await
            .map(|out| out.to_lowercase().contains("android debug bridge"))
            .unwrap_or(false)
    }

    /// Runs adb and returns stdout and stderr together, trimmed, like the Electron service.
    pub async fn run(&self, args: &[&str], timeout: Duration) -> Result<String, AdbError> {
        let path = self.executable_path().await.ok_or(AdbError::NotFound)?;
        run_executable(&path, args, timeout).await
    }

    pub async fn version(&self) -> Result<String, AdbError> {
        self.run(&["version"], VERSION_TIMEOUT).await
    }

    /// mDNS lets adb find phones without typing an address. Some adb builds or networks lack it.
    pub async fn check_mdns(&self) -> Result<(), AdbError> {
        let out = self.run(&["mdns", "check"], NETWORK_TIMEOUT).await?;
        let lower = out.to_lowercase();
        if lower.contains("mdns daemon version")
            && !lower.contains("unavailable")
            && !lower.contains("error")
        {
            Ok(())
        } else {
            Err(AdbError::Failed(Msg::MdnsUnsupported.text(self.locale())))
        }
    }

    pub async fn list_mdns_services(&self) -> Result<Vec<MdnsService>, AdbError> {
        let out = self.run(&["mdns", "services"], NETWORK_TIMEOUT).await?;
        Ok(parse_mdns_services(&out))
    }

    pub async fn pair(&self, address: &str, code: &str) -> Result<String, AdbError> {
        let out = self.run(&["pair", address, code], NETWORK_TIMEOUT).await?;
        if out.to_lowercase().contains("successfully paired") {
            return Ok(Msg::Paired.text(self.locale()));
        }
        // The pairing code is never logged, only adb's verdict.
        Err(self.verdict_or(&out, Msg::PairFailed))
    }

    pub async fn connect(&self, address: &str) -> Result<String, AdbError> {
        let out = self.run(&["connect", address], NETWORK_TIMEOUT).await?;
        let verdict = last_line(&out).to_lowercase();
        if verdict.starts_with("connected") || verdict.starts_with("already connected") {
            return Ok(Msg::ConnectedTo(address).text(self.locale()));
        }
        Err(self.verdict_or(&out, Msg::ConnectFailed))
    }

    pub async fn disconnect(&self, address: &str) -> Result<String, AdbError> {
        self.run(&["disconnect", address], NETWORK_TIMEOUT).await?;
        Ok(Msg::DisconnectedFrom(address).text(self.locale()))
    }

    fn verdict_or(&self, output: &str, fallback: Msg<'_>) -> AdbError {
        let verdict = last_line(output);
        AdbError::Failed(if verdict.is_empty() {
            fallback.text(self.locale())
        } else {
            verdict.to_owned()
        })
    }

    /// Reads the developer options the settings screen shows. Both are plain `settings get` calls.
    pub async fn device_settings(&self, device_id: &str) -> Result<DeviceSettings, AdbError> {
        let get = |table: &'static str, name: &'static str| {
            let args = ["-s", device_id, "shell", "settings", "get", table, name];
            async move { self.run(&args, NETWORK_TIMEOUT).await }
        };
        let (touches, awake) = tokio::join!(
            get("system", "show_touches"),
            get("global", "stay_on_while_plugged_in")
        );
        let (touches, awake) = (touches?, awake?);
        Ok(DeviceSettings {
            show_touches: touches.trim() == "1",
            // 0 is off; any other bitmask (USB, AC, wireless) keeps the screen on while charging.
            stay_awake: !matches!(awake.trim(), "" | "0" | "null"),
        })
    }

    pub async fn set_device_setting(
        &self,
        device_id: &str,
        key: DeviceSettingKey,
        enabled: bool,
    ) -> Result<(), AdbError> {
        let (table, name, on) = match key {
            DeviceSettingKey::ShowTouches => ("system", "show_touches", "1"),
            DeviceSettingKey::StayAwake => ("global", "stay_on_while_plugged_in", "7"),
        };
        let value = if enabled { on } else { "0" };
        self.run(
            &[
                "-s", device_id, "shell", "settings", "put", table, name, value,
            ],
            NETWORK_TIMEOUT,
        )
        .await
        .map(|_| ())
    }

    pub async fn install_apk(&self, device_id: &str, apk_path: &Path) -> Result<(), AdbError> {
        let apk = apk_path.to_string_lossy();
        let out = self
            .run(
                &["-s", device_id, "install", "-r", "-t", &apk],
                INSTALL_TIMEOUT,
            )
            .await?;
        if out.lines().any(|line| line.starts_with("Success")) {
            Ok(())
        } else {
            Err(self.verdict_or(&out, Msg::InstallFailed))
        }
    }

    /// Lists the attached phones, with the name people know each one by.
    pub async fn list_devices(&self) -> Result<Vec<AndroidDevice>, AdbError> {
        let out = self.run(&["devices", "-l"], NETWORK_TIMEOUT).await?;
        let mut devices = parse_adb_devices_output(&out);

        self.device_names
            .lock()
            .expect("names lock")
            .retain(|id, _| devices.iter().any(|device| &device.id == id));

        let names = join_all(devices.iter().map(|device| self.look_up_name(device))).await;
        for (device, name) in devices.iter_mut().zip(names) {
            device.display_name = name.or_else(|| device.model.as_deref().map(friendly_model_name));
        }
        Ok(devices)
    }

    /// Reads the phone's marketing name once; only a phone that is online can answer.
    async fn look_up_name(&self, device: &AndroidDevice) -> Option<String> {
        if let Some(cached) = self
            .device_names
            .lock()
            .expect("names lock")
            .get(&device.id)
        {
            return cached.clone();
        }
        if device.status != DeviceStatus::Device {
            return None;
        }
        let command = device_name_shell_command();
        let answer = self
            .run(&["-s", &device.id, "shell", &command], DEVICE_NAME_TIMEOUT)
            .await;
        // A phone that has just come online may not answer yet; ask again on the next refresh.
        let output = answer.ok()?;
        let name = parse_device_name(&output);
        self.device_names
            .lock()
            .expect("names lock")
            .insert(device.id.clone(), name.clone());
        name
    }
}

/// Spawns `executable` and waits for it, killing it when the timeout expires.
async fn run_executable(
    executable: &Path,
    args: &[&str],
    timeout: Duration,
) -> Result<String, AdbError> {
    let child = Command::new(executable)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|error| match error.kind() {
            std::io::ErrorKind::NotFound => AdbError::NotFound,
            _ => AdbError::Io(error),
        })?;

    let output = tokio::time::timeout(timeout, child.wait_with_output())
        .await
        .map_err(|_| AdbError::TimedOut)??;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    if output.status.success() {
        Ok(format!("{stdout}\n{stderr}").trim().to_owned())
    } else {
        let message = stderr.trim();
        Err(AdbError::Failed(if message.is_empty() {
            stdout.trim().to_owned()
        } else {
            message.to_owned()
        }))
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    /// A fake `adb`: a shell script whose `case` body decides what each command prints.
    fn fake_adb(body: &str) -> (PathBuf, PathBuf) {
        let dir = std::env::temp_dir().join(format!(
            "masaya-cli-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::SeqCst)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let script = dir.join("adb");
        std::fs::write(
            &script,
            format!("#!/bin/sh\ncase \"$*\" in\n{body}\nesac\n"),
        )
        .unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        (dir, script)
    }

    fn cli_with(script: &Path) -> AdbCli {
        let cli = AdbCli::with_env(Locale::En, PathEnv::default());
        cli.set_custom_path(Some(script.to_path_buf()));
        cli
    }

    #[tokio::test]
    async fn spawning_a_missing_executable_is_reported_as_adb_not_found() {
        let result = run_executable(
            Path::new("/nonexistent/adb"),
            &["version"],
            Duration::from_secs(1),
        )
        .await;
        assert!(matches!(result, Err(AdbError::NotFound)), "{result:?}");
    }

    #[tokio::test]
    async fn lists_devices_with_marketing_names_and_caches_them() {
        let (dir, script) = fake_adb(
            r#"
"devices -l") printf 'List of devices attached\nR5CT device usb:1 model:SM_S918B\nZZ offline\n';;
"-s R5CT shell for p in"*) printf 'ro.product.marketname=Masaya Test Phone\nro.product.model=SM-S918B\n';;
*) echo "unexpected: $*" >&2; exit 1;;"#,
        );
        let cli = cli_with(&script);
        let devices = cli.list_devices().await.unwrap();
        assert_eq!(devices.len(), 2);
        // The marketing name comes from the phone, not from the model code in the listing.
        assert_eq!(
            devices[0].display_name.as_deref(),
            Some("Masaya Test Phone")
        );
        // An offline phone cannot answer; its (absent) model gives no name either.
        assert_eq!(devices[1].display_name, None);

        // Break the name lookup: the cached name must still be served.
        std::fs::write(&script, "#!/bin/sh\ncase \"$*\" in\n\"devices -l\") printf 'R5CT device model:SM_S918B\\n';;\n*) exit 1;;\nesac\n").unwrap();
        let again = cli.list_devices().await.unwrap();
        assert_eq!(again[0].display_name.as_deref(), Some("Masaya Test Phone"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn connect_translates_the_verdict() {
        let (dir, script) = fake_adb(
            r#"
"connect 10.0.0.2:5555") echo "connected to 10.0.0.2:5555";;
"connect 10.0.0.3:5555") echo "already connected to 10.0.0.3:5555";;
"connect 10.0.0.4:5555") echo "failed to connect to '10.0.0.4:5555': Connection refused";;
*) exit 1;;"#,
        );
        let cli = cli_with(&script);
        assert_eq!(
            cli.connect("10.0.0.2:5555").await.unwrap(),
            "Connected to 10.0.0.2:5555."
        );
        assert_eq!(
            cli.connect("10.0.0.3:5555").await.unwrap(),
            "Connected to 10.0.0.3:5555."
        );
        match cli.connect("10.0.0.4:5555").await {
            Err(AdbError::Failed(message)) => assert!(message.starts_with("failed to connect")),
            other => panic!("unexpected: {other:?}"),
        }
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn pair_never_echoes_the_code() {
        let (dir, script) = fake_adb(
            r#"
"pair 10.0.0.2:4000 123456") echo "Successfully paired to 10.0.0.2:4000 [guid=adb-x]";;
"pair 10.0.0.2:4000 000000") echo "Failed: Wrong password or connection was dropped";;
*) exit 1;;"#,
        );
        let cli = cli_with(&script);
        assert_eq!(
            cli.pair("10.0.0.2:4000", "123456").await.unwrap(),
            "Device paired."
        );
        match cli.pair("10.0.0.2:4000", "000000").await {
            Err(AdbError::Failed(message)) => assert!(!message.contains("000000")),
            other => panic!("unexpected: {other:?}"),
        }
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn reads_and_writes_device_settings() {
        let (dir, script) = fake_adb(
            r#"
"-s R5CT shell settings get system show_touches") echo 1;;
"-s R5CT shell settings get global stay_on_while_plugged_in") echo 7;;
"-s R5CT shell settings put system show_touches 0") echo "put" >> "$0.log";;
"-s R5CT shell settings put global stay_on_while_plugged_in 7") echo "put" >> "$0.log";;
*) exit 1;;"#,
        );
        let cli = cli_with(&script);
        let settings = cli.device_settings("R5CT").await.unwrap();
        assert!(settings.show_touches && settings.stay_awake);
        cli.set_device_setting("R5CT", DeviceSettingKey::ShowTouches, false)
            .await
            .unwrap();
        cli.set_device_setting("R5CT", DeviceSettingKey::StayAwake, true)
            .await
            .unwrap();
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn install_needs_the_success_line() {
        let (dir, script) = fake_adb(
            r#"
"-s R5CT install -r -t /ok.apk") printf 'Performing Streamed Install\nSuccess\n';;
"-s R5CT install -r -t /bad.apk") printf 'Performing Streamed Install\nFailure [INSTALL_FAILED_OLDER_SDK]\n';;
*) exit 1;;"#,
        );
        let cli = cli_with(&script);
        cli.install_apk("R5CT", Path::new("/ok.apk")).await.unwrap();
        match cli.install_apk("R5CT", Path::new("/bad.apk")).await {
            Err(AdbError::Failed(message)) => assert!(message.contains("INSTALL_FAILED_OLDER_SDK")),
            other => panic!("unexpected: {other:?}"),
        }
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn a_command_that_never_answers_times_out() {
        let (dir, script) = fake_adb(r#"*) sleep 5;;"#);
        let cli = cli_with(&script);
        let result = cli.run(&["version"], Duration::from_millis(150)).await;
        assert!(matches!(result, Err(AdbError::TimedOut)));
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn verify_executable_recognises_adb() {
        let (dir, script) = fake_adb(
            r#"version) echo "Android Debug Bridge version 1.0.41";;
*) exit 1;;"#,
        );
        assert!(AdbCli::verify_executable(&script).await);
        let (dir2, other) = fake_adb(r#"*) echo "not it";;"#);
        assert!(!AdbCli::verify_executable(&other).await);
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(dir2).ok();
    }

    #[test]
    fn last_line_is_the_verdict() {
        assert_eq!(last_line("a\n\nfailed: nope\n"), "failed: nope");
        assert_eq!(last_line("  \n"), "");
    }
}
