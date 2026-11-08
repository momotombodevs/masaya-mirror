//! Every text the app shows, in one place, so screens and tests use the same words. Status labels
//! keep the wording of the removed Electron app (`devices.status.*`).

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

// --- Mirror windows (slice 1.3). English in each comment, for the i18n module. ---

/// The badge of a phone whose mirror window is open, in place of its status (en: "Mirroring").
pub const MIRRORING: &str = "Duplicando";
/// The secondary action of a mirror that failed or ended (en: "Close").
pub const CLOSE: &str = "Cerrar";
/// What to do when the stream ends (en: "Check the USB cable and press Reconnect.").
pub const MIRROR_ENDED_HINT: &str = "Revisa el cable USB y pulsa Reconectar.";
/// The video's screen reader hint (en: "Keys and clicks go to the phone. Escape is Back.
/// Command W closes the window.").
pub const MIRROR_VIDEO_HINT: &str =
    "Las teclas y los clics van al teléfono. Escape es Atrás. Comando W cierra la ventana.";
/// The Window menu's item that shows the list again (en: "Devices").
pub const MENU_DEVICES: &str = "Dispositivos";

/// The screen reader's label of a phone whose mirror window is open: pressing it shows the
/// window (en: "Show {name}'s window, mirroring").
pub fn mirroring_label(name: &str) -> String {
    format!("Mostrar ventana de {name}, duplicando")
}

/// Announced when a mirror window starts connecting (en: "Connecting to {name}").
pub fn mirror_connecting_announcement(name: &str) -> String {
    format!("Conectando con {name}")
}

/// Announced once the video shows (en: "{name}'s mirror is live. Escape is Back.").
pub fn mirror_live_announcement(name: &str) -> String {
    format!("Espejo de {name} activo. Escape es Atrás.")
}

/// A phone's window title and video name when the list shows ids, so two phones of the same
/// model can be told apart (en: same).
pub fn mirror_title(label: &str, id: &str) -> String {
    format!("{label} · {id}")
}
