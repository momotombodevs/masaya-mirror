//! What the screens show, as plain values: no NSH types, so every rule here is unit tested.

use std::collections::HashMap;

use masaya_core::adb::{AndroidDevice, DeviceStatus};

use crate::copy;
use crate::source::{DevicesResult, LoadError};

/// The mirror screen's state.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MirrorView {
    Starting,
    /// The text is meant for the user.
    Failed(String),
    /// The video shows in the view registered under `key` ([`crate::mirror::sink`]).
    Running {
        key: String,
        width: u32,
        height: u32,
    },
    /// The phone stopped sending; why, when it broke rather than closed.
    Ended(Option<String>),
}

impl MirrorView {
    pub fn kind(&self) -> MirrorKind {
        match self {
            Self::Starting => MirrorKind::Starting,
            Self::Failed(_) => MirrorKind::Failed,
            Self::Running { .. } => MirrorKind::Running,
            Self::Ended(_) => MirrorKind::Ended,
        }
    }

    /// The detail under a failure or an end.
    pub fn detail(&self) -> String {
        match self {
            Self::Failed(detail) | Self::Ended(Some(detail)) => detail.clone(),
            _ => String::new(),
        }
    }

    pub fn key(&self) -> Option<String> {
        match self {
            Self::Running { key, .. } => Some(key.clone()),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MirrorKind {
    Starting,
    Failed,
    Running,
    Ended,
}

/// One phone in the list, ready to show.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeviceRow {
    pub id: String,
    pub label: String,
    pub status: DeviceStatus,
    /// Another phone shows the same name: the serial tells them apart.
    pub show_id: bool,
}

impl DeviceRow {
    /// Only a phone adb can talk to can be mirrored.
    pub fn openable(&self) -> bool {
        self.status == DeviceStatus::Device
    }

    pub fn status_text(&self) -> &'static str {
        match self.status {
            DeviceStatus::Device => copy::STATUS_DEVICE,
            DeviceStatus::Unauthorized => copy::STATUS_UNAUTHORIZED,
            DeviceStatus::Offline => copy::STATUS_OFFLINE,
            DeviceStatus::Unknown => copy::STATUS_UNKNOWN,
        }
    }

    /// What the user can do about a phone that cannot be opened.
    pub fn hint(&self) -> Option<&'static str> {
        match self.status {
            DeviceStatus::Device => None,
            DeviceStatus::Unauthorized => Some(copy::HINT_UNAUTHORIZED),
            DeviceStatus::Offline | DeviceStatus::Unknown => Some(copy::HINT_RECONNECT),
        }
    }

    /// What a screen reader says for the row.
    /// What its mirror window is titled: its name, and its serial when the list shows serials
    /// (two phones of the same model).
    pub fn window_title(&self) -> String {
        if self.show_id {
            copy::mirror_title(&self.label, &self.id)
        } else {
            self.label.clone()
        }
    }

    pub fn accessibility_label(&self) -> String {
        if self.openable() {
            copy::open_label(&self.label)
        } else {
            copy::unavailable_label(&self.label, self.status_text(), self.hint())
        }
    }
}

/// The name people know the phone by, then its model, then its serial.
fn label(device: &AndroidDevice) -> String {
    let present = |value: &Option<String>| {
        value
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
    };
    present(&device.display_name)
        // `adb devices -l` prints models with underscores ("Pixel_7").
        .or_else(|| present(&device.model).map(|model| model.replace('_', " ")))
        .unwrap_or_else(|| device.id.clone())
}

/// The rows in the order adb lists the phones, so a refresh never reorders them. Ports
/// `isAmbiguous` from `DeviceList.tsx`, on the label shown (two phones of one model look alike
/// whether the name came from the phone or from its model).
pub fn device_rows(devices: &[AndroidDevice]) -> Vec<DeviceRow> {
    let labels: Vec<String> = devices.iter().map(label).collect();
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for label in &labels {
        *counts.entry(label.as_str()).or_default() += 1;
    }
    devices
        .iter()
        .zip(&labels)
        .map(|(device, label)| DeviceRow {
            id: device.id.clone(),
            label: label.clone(),
            status: device.status,
            show_id: *label != device.id && counts.get(label.as_str()).copied().unwrap_or(0) > 1,
        })
        .collect()
}

/// The device list screen's state.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DevicesView {
    Loading,
    Empty,
    Error(LoadError),
    Ready(Vec<DeviceRow>),
}

impl DevicesView {
    fn from_devices(devices: &[AndroidDevice]) -> Self {
        if devices.is_empty() {
            Self::Empty
        } else {
            Self::Ready(device_rows(devices))
        }
    }

    /// Which of the four states it is, so a change of rows alone keeps the screen in place.
    pub fn kind(&self) -> ViewKind {
        match self {
            Self::Loading => ViewKind::Loading,
            Self::Empty => ViewKind::Empty,
            Self::Error(_) => ViewKind::Error,
            Self::Ready(_) => ViewKind::Ready,
        }
    }

    /// A list was read (empty or not): a refresh that fails can keep showing it.
    pub fn has_data(&self) -> bool {
        matches!(self, Self::Empty | Self::Ready(_))
    }

    pub fn rows(&self) -> Vec<DeviceRow> {
        match self {
            Self::Ready(rows) => rows.clone(),
            _ => Vec::new(),
        }
    }

    pub fn error(&self) -> Option<LoadError> {
        match self {
            Self::Error(error) => Some(error.clone()),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ViewKind {
    Loading,
    Empty,
    Error,
    Ready,
}

/// Silent refreshes that may fail in a row before the list gives way to the error.
pub const FAILURES_BEFORE_ERROR: u32 = 3;

/// The list's state across loads: what shows, and what is worth logging.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DevicesModel {
    pub view: DevicesView,
    failures: u32,
    last_logged: Option<String>,
}

impl Default for DevicesModel {
    fn default() -> Self {
        Self {
            view: DevicesView::Loading,
            failures: 0,
            last_logged: None,
        }
    }
}

impl DevicesModel {
    /// Applies a load. A failed refresh keeps the last list until
    /// [`FAILURES_BEFORE_ERROR`] fail in a row; with no list yet the error shows at once. Answers
    /// the failure to log, only when its text changed, so a 2 s refresh does not flood the log.
    /// Equal results leave an equal view, which the screen does not redraw.
    pub fn apply(&mut self, result: DevicesResult) -> Option<String> {
        match result {
            Ok(devices) => {
                self.failures = 0;
                self.last_logged = None;
                self.view = DevicesView::from_devices(&devices);
                None
            }
            Err(error) => {
                self.failures = self.failures.saturating_add(1);
                let log = (self.last_logged.as_deref() != Some(error.detail.as_str()))
                    .then(|| error.detail.clone());
                if log.is_some() {
                    self.last_logged = log.clone();
                }
                if !self.view.has_data() || self.failures >= FAILURES_BEFORE_ERROR {
                    self.view = DevicesView::Error(error);
                }
                log
            }
        }
    }

    /// The user asked to load again. Without a list to keep showing, the screen goes back to
    /// loading; with one, it stays as it is until the new list arrives.
    pub fn retry(&mut self) {
        if !self.view.has_data() {
            self.view = DevicesView::Loading;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn device(
        id: &str,
        status: DeviceStatus,
        model: Option<&str>,
        name: Option<&str>,
    ) -> AndroidDevice {
        AndroidDevice {
            id: id.to_owned(),
            status,
            model: model.map(str::to_owned),
            product: None,
            display_name: name.map(str::to_owned),
        }
    }

    fn online(id: &str) -> AndroidDevice {
        device(id, DeviceStatus::Device, None, None)
    }

    #[test]
    fn label_prefers_display_name_then_model_then_id() {
        let rows = device_rows(&[
            device(
                "a",
                DeviceStatus::Device,
                Some("SM_S918B"),
                Some("Galaxy S23 Ultra"),
            ),
            device("b", DeviceStatus::Device, Some("Pixel_7"), None),
            device("c", DeviceStatus::Device, None, Some("  ")),
        ]);
        let labels: Vec<_> = rows.iter().map(|row| row.label.as_str()).collect();
        assert_eq!(labels, ["Galaxy S23 Ultra", "Pixel 7", "c"]);
    }

    #[test]
    fn only_phones_with_the_same_name_show_their_serial() {
        let rows = device_rows(&[
            device("a", DeviceStatus::Device, None, Some("Pixel 8")),
            device("b", DeviceStatus::Device, None, Some("Pixel 8")),
            device("c", DeviceStatus::Device, None, Some("Galaxy S23")),
        ]);
        let shown: Vec<_> = rows.iter().map(|row| row.show_id).collect();
        assert_eq!(shown, [true, true, false]);
        // Their windows can be told apart too.
        let titles: Vec<_> = rows.iter().map(DeviceRow::window_title).collect();
        assert_eq!(titles, ["Pixel 8 · a", "Pixel 8 · b", "Galaxy S23"]);
    }

    #[test]
    fn only_online_phones_open_and_the_others_say_why() {
        let rows = device_rows(&[
            device("ok", DeviceStatus::Device, None, Some("Pixel 8")),
            device("auth", DeviceStatus::Unauthorized, None, Some("Moto G")),
            device("off", DeviceStatus::Offline, None, None),
        ]);
        assert!(rows[0].openable());
        assert_eq!(rows[0].status_text(), "Conectado");
        assert_eq!(rows[0].hint(), None);
        assert_eq!(rows[0].accessibility_label(), "Abrir Pixel 8");
        assert!(!rows[1].openable());
        assert_eq!(rows[1].hint(), Some(copy::HINT_UNAUTHORIZED));
        assert_eq!(rows[1].status_text(), "Sin autorizar");
        assert_eq!(
            rows[1].accessibility_label(),
            format!("Moto G, Sin autorizar. {}", copy::HINT_UNAUTHORIZED)
        );
        assert!(!rows[2].openable());
        assert_eq!(rows[2].status_text(), "Desconectado");
    }

    #[test]
    fn rows_keep_adb_order() {
        let rows = device_rows(&[online("z"), online("a")]);
        assert_eq!(rows[0].id, "z");
        assert_eq!(rows[1].id, "a");
    }

    #[test]
    fn a_result_maps_to_its_state() {
        let mut model = DevicesModel::default();
        model.apply(Ok(Vec::new()));
        assert_eq!(model.view, DevicesView::Empty);
        model.apply(Ok(vec![online("x")]));
        assert_eq!(model.view.kind(), ViewKind::Ready);
        assert_eq!(model.view.rows().len(), 1);

        let mut first = DevicesModel::default();
        first.apply(Err(LoadError::other("adb no responde")));
        assert_eq!(
            first.view,
            DevicesView::Error(LoadError::other("adb no responde"))
        );
    }

    #[test]
    fn a_failed_refresh_keeps_the_list_until_three_fail_in_a_row() {
        let mut model = DevicesModel::default();
        model.apply(Ok(vec![online("x")]));
        model.apply(Err(LoadError::other("boom")));
        model.apply(Err(LoadError::other("boom")));
        assert_eq!(model.view.kind(), ViewKind::Ready);
        model.apply(Ok(vec![online("x")]));
        model.apply(Err(LoadError::other("boom")));
        model.apply(Err(LoadError::other("boom")));
        assert_eq!(
            model.view.kind(),
            ViewKind::Ready,
            "a success resets the count"
        );
        model.apply(Err(LoadError::other("boom")));
        assert_eq!(model.view.kind(), ViewKind::Error);
    }

    #[test]
    fn logs_a_failure_only_when_its_text_changes() {
        let mut model = DevicesModel::default();
        assert_eq!(
            model.apply(Err(LoadError::other("a"))),
            Some("a".to_owned())
        );
        assert_eq!(model.apply(Err(LoadError::other("a"))), None);
        assert_eq!(
            model.apply(Err(LoadError::other("b"))),
            Some("b".to_owned())
        );
        model.apply(Ok(Vec::new()));
        assert_eq!(
            model.apply(Err(LoadError::other("b"))),
            Some("b".to_owned())
        );
    }

    #[test]
    fn retry_shows_loading_only_without_a_list() {
        let mut model = DevicesModel::default();
        model.apply(Err(LoadError::other("a")));
        model.retry();
        assert_eq!(model.view, DevicesView::Loading);
        model.apply(Ok(Vec::new()));
        model.retry();
        assert_eq!(model.view, DevicesView::Empty);
    }

    #[test]
    fn the_same_devices_give_an_equal_state() {
        let load = || {
            let mut model = DevicesModel::default();
            model.apply(Ok(vec![online("x")]));
            model.view
        };
        assert_eq!(load(), load());
    }
}
