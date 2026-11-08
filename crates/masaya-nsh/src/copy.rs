//! Every text the app shows, in one place, so screens and tests use the same words. Status labels
//! match the Electron app (`src/shared/i18n/messages.ts`, `devices.status.*`).

pub const DEVICES_TITLE: &str = "Dispositivos";
pub const LOADING: &str = "Buscando dispositivos…";

pub const EMPTY_TITLE: &str = "Sin dispositivos";
pub const EMPTY_HINT: &str = "Conecta un Android por USB y activa la depuración USB";
pub const REFRESH: &str = "Actualizar";

pub const ADB_NOT_FOUND: &str =
    "No encontramos adb. Instálalo con `brew install android-platform-tools` y pulsa Reintentar.";
pub const LIST_FAILED: &str = "No se pudo leer la lista de dispositivos.";
pub const RETRY: &str = "Reintentar";

pub const STATUS_DEVICE: &str = "Conectado";
pub const STATUS_OFFLINE: &str = "Desconectado";
pub const STATUS_UNAUTHORIZED: &str = "Sin autorizar";
pub const STATUS_UNKNOWN: &str = "Desconocido";

pub const HINT_UNAUTHORIZED: &str =
    "Desbloquea el teléfono y toca Permitir en el aviso de depuración USB";
pub const HINT_RECONNECT: &str = "Desconecta y vuelve a conectar el cable USB";

pub const BACK: &str = "Volver";
pub const MIRROR_STARTING: &str = "Conectando con el teléfono…";
pub const MIRROR_FAILED: &str = "No se pudo iniciar el espejo.";
pub const MIRROR_ENDED: &str = "La transmisión terminó.";
pub const MIRROR_NO_VIDEO: &str = "No se pudo mostrar el video del teléfono.";
pub const MIRROR_RECONNECT: &str = "Reconectar";
/// The screen reader's label of the video.
pub fn mirror_label(name: &str) -> String {
    format!("Pantalla de {name}")
}

/// The screen reader's label of a phone that opens.
pub fn open_label(name: &str) -> String {
    format!("Abrir {name}")
}

/// The screen reader's label of a phone that cannot open: its name, state and what to do.
pub fn unavailable_label(name: &str, status: &str, hint: Option<&str>) -> String {
    match hint {
        Some(hint) => format!("{name}, {status}. {hint}"),
        None => format!("{name}, {status}"),
    }
}

/// What the screen reader announces when the list changes state.
pub fn devices_announcement(count: usize) -> String {
    match count {
        1 => "1 dispositivo".to_owned(),
        count => format!("{count} dispositivos"),
    }
}
