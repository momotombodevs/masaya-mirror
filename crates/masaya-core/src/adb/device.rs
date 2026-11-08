//! Device types and the parsers for what `adb` prints.
//! Ports `parseAdbDevicesOutput` and `parseMdnsServices` from the removed Electron app's `adb.service.ts`.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DeviceStatus {
    Device,
    Offline,
    Unauthorized,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidDevice {
    pub id: String,
    pub status: DeviceStatus,
    /// As `adb devices -l` prints it, with dashes and spaces turned into underscores.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub product: Option<String>,
    /// The name people know the phone by ("Galaxy S23 Ultra"), when it could be worked out.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
}

/// Developer options a mirror window can flip on the phone itself.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSettings {
    /// Draws a dot where the screen is touched.
    pub show_touches: bool,
    /// Keeps the screen on while the phone is charging or plugged in.
    pub stay_awake: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DeviceSettingKey {
    ShowTouches,
    StayAwake,
}

/// Every state `adb devices` can print. `no permissions` is followed by a reason in parentheses.
const STATES: [&str; 10] = [
    "device",
    "offline",
    "unauthorized",
    "authorizing",
    "connecting",
    "recovery",
    "sideload",
    "rescue",
    "bootloader",
    "host",
];
const NO_PERMISSIONS: &str = "no permissions";

fn parse_status(raw: &str) -> DeviceStatus {
    match raw {
        "device" => DeviceStatus::Device,
        "offline" => DeviceStatus::Offline,
        "unauthorized" => DeviceStatus::Unauthorized,
        _ => DeviceStatus::Unknown,
    }
}

/// Splits `rest` into the state keyword and what follows it. The keyword must end at whitespace
/// or at the end of the line, so `devices` is not mistaken for `device`.
fn split_state(rest: &str) -> Option<(&str, &str)> {
    let keyword = std::iter::once(NO_PERMISSIONS)
        .chain(STATES)
        .find(|keyword| {
            rest.strip_prefix(keyword)
                .is_some_and(|after| after.is_empty() || after.starts_with(char::is_whitespace))
        })?;
    Some((keyword, rest[keyword.len()..].trim_start()))
}

/// Parses `adb devices -l`. Daemon chatter ("* daemon started") and unknown lines are skipped.
pub fn parse_adb_devices_output(stdout: &str) -> Vec<AndroidDevice> {
    let mut devices = Vec::new();
    for line in stdout.lines() {
        let trimmed = line.trim();
        // "* daemon started successfully" and the like are adb talking about itself.
        if trimmed.is_empty() || trimmed.starts_with('*') {
            continue;
        }
        let Some((id, after_id)) = trimmed.split_once(char::is_whitespace) else {
            continue;
        };
        let Some((status, rest)) = split_state(after_id.trim_start()) else {
            continue;
        };

        let (mut model, mut product) = (None, None);
        for token in rest.split_whitespace() {
            match token.split_once(':') {
                Some(("model", value)) if !value.is_empty() => model = Some(value.to_owned()),
                Some(("product", value)) if !value.is_empty() => product = Some(value.to_owned()),
                _ => {}
            }
        }

        devices.push(AndroidDevice {
            id: id.to_owned(),
            status: parse_status(status),
            model,
            product,
            display_name: None,
        });
    }
    devices
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MdnsKind {
    /// The phone is showing the QR/code pairing screen.
    Pairing,
    /// A phone ready to connect.
    Connect,
}

/// A service adb found on the local network through mDNS.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MdnsService {
    pub name: String,
    pub kind: MdnsKind,
    pub address: String,
}

fn parse_mdns_kind(service: &str) -> Option<MdnsKind> {
    match service.strip_suffix('.').unwrap_or(service) {
        "_adb-tls-pairing._tcp" => Some(MdnsKind::Pairing),
        "_adb-tls-connect._tcp" => Some(MdnsKind::Connect),
        _ => None,
    }
}

/// `host:port` with a numeric port, and not a bracketed IPv6 literal.
fn is_ipv4_or_host_address(address: &str) -> bool {
    !address.starts_with('[')
        && address.rsplit_once(':').is_some_and(|(host, port)| {
            !host.is_empty() && !port.is_empty() && port.bytes().all(|byte| byte.is_ascii_digit())
        })
}

/// Parses `adb mdns services`, keeping only wireless-debugging entries with an IPv4/host address.
pub fn parse_mdns_services(stdout: &str) -> Vec<MdnsService> {
    stdout
        .lines()
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let (name, service, address) = (parts.next()?, parts.next()?, parts.next()?);
            if parts.next().is_some() {
                return None;
            }
            let kind = parse_mdns_kind(service)?;
            is_ipv4_or_host_address(address).then(|| MdnsService {
                name: name.to_owned(),
                kind,
                address: address.to_owned(),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_long_listing() {
        let out = "List of devices attached\n\
            R5CT1234ABC            device usb:1-1 product:dm3qxxx model:SM_S918B device:dm3q transport_id:3\n\
            192.168.1.5:5555       offline\n\
            ZY22                   unauthorized usb:1-2 transport_id:4\n";
        let devices = parse_adb_devices_output(out);
        assert_eq!(devices.len(), 3);
        assert_eq!(devices[0].id, "R5CT1234ABC");
        assert_eq!(devices[0].status, DeviceStatus::Device);
        assert_eq!(devices[0].model.as_deref(), Some("SM_S918B"));
        assert_eq!(devices[0].product.as_deref(), Some("dm3qxxx"));
        assert_eq!(devices[1].status, DeviceStatus::Offline);
        assert_eq!(devices[1].model, None);
        assert_eq!(devices[2].status, DeviceStatus::Unauthorized);
    }

    #[test]
    fn skips_daemon_chatter_blank_lines_and_the_header() {
        let out = "* daemon not running; starting now at tcp:5037\n\
            * daemon started successfully\n\nList of devices attached\n\n";
        assert!(parse_adb_devices_output(out).is_empty());
    }

    #[test]
    fn other_states_are_unknown_and_no_permissions_keeps_its_reason_out_of_the_model() {
        let out = "AAA recovery transport_id:1\n\
            BBB no permissions (user in plugdev group; are your udev rules wrong?); see [url] model:X\n";
        let devices = parse_adb_devices_output(out);
        assert_eq!(devices[0].status, DeviceStatus::Unknown);
        assert_eq!(devices[1].id, "BBB");
        assert_eq!(devices[1].status, DeviceStatus::Unknown);
        assert_eq!(devices[1].model.as_deref(), Some("X"));
    }

    #[test]
    fn a_state_keyword_must_end_at_a_word_boundary() {
        assert!(parse_adb_devices_output("AAA devices usb:1\n").is_empty());
        assert!(parse_adb_devices_output("lonelyword\n").is_empty());
    }

    #[test]
    fn serializes_for_the_renderer_in_camel_case_without_empty_fields() {
        let mut devices = parse_adb_devices_output("AAA device model:Pixel_8\n");
        devices[0].display_name = Some("Pixel 8".into());
        let json = serde_json::to_value(&devices[0]).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "id": "AAA", "status": "device", "model": "Pixel_8", "displayName": "Pixel 8"
            })
        );
    }

    #[test]
    fn mdns_keeps_only_wireless_debugging_entries_with_a_plain_address() {
        let out = "List of discovered mdns services\n\
            adb-R5CT-abc    _adb-tls-connect._tcp.   192.168.1.5:37123\n\
            studio-7        _adb-tls-pairing._tcp    192.168.1.5:41999\n\
            adb-v6          _adb-tls-connect._tcp.   [fe80::1]:5555\n\
            printer         _ipp._tcp.               192.168.1.9:631\n\
            broken          _adb-tls-connect._tcp.   192.168.1.5:abc\n";
        let services = parse_mdns_services(out);
        assert_eq!(
            services,
            vec![
                MdnsService {
                    name: "adb-R5CT-abc".into(),
                    kind: MdnsKind::Connect,
                    address: "192.168.1.5:37123".into()
                },
                MdnsService {
                    name: "studio-7".into(),
                    kind: MdnsKind::Pairing,
                    address: "192.168.1.5:41999".into()
                },
            ]
        );
    }
}
