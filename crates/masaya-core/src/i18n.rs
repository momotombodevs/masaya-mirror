//! The few messages the core produces itself, in Spanish and English. The wording comes from the
//! `main.*` messages of the removed Electron app, so users see the text they already know.

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Locale {
    #[default]
    Es,
    En,
}

impl Locale {
    /// `"en"`, `"en-US"` and the like select English; anything else is Spanish, the default.
    pub fn from_tag(tag: &str) -> Self {
        if tag.to_ascii_lowercase().starts_with("en") {
            Self::En
        } else {
            Self::Es
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Msg<'a> {
    AdbTimeout,
    AdbUnknown,
    MdnsUnsupported,
    Paired,
    PairFailed,
    ConnectedTo(&'a str),
    ConnectFailed,
    InstallFailed,
    DisconnectedFrom(&'a str),
    ScrcpyMissing(&'a str),
    MirrorStartFailed,
}

impl Msg<'_> {
    pub fn text(self, locale: Locale) -> String {
        use Locale::{En, Es};
        match (self, locale) {
            (Self::AdbTimeout, Es) => "adb no responde. Vuelve a conectar el teléfono o ejecuta `adb kill-server` y reintenta.".into(),
            (Self::AdbTimeout, En) => "adb is not responding. Reconnect the phone, or run `adb kill-server` and try again.".into(),
            (Self::AdbUnknown, Es) => "No se pudo ejecutar adb.".into(),
            (Self::AdbUnknown, En) => "Could not run adb.".into(),
            (Self::MdnsUnsupported, Es) => "Esta red o esta versión de adb no permite buscar el teléfono. Prueba con otra red Wi-Fi o conéctalo por USB.".into(),
            (Self::MdnsUnsupported, En) => "This network or adb version cannot discover the phone. Try another Wi-Fi network or connect it over USB.".into(),
            (Self::Paired, Es) => "Dispositivo vinculado.".into(),
            (Self::Paired, En) => "Device paired.".into(),
            (Self::PairFailed, Es) => "No se pudo vincular. Revisa la dirección y el código.".into(),
            (Self::PairFailed, En) => "Could not pair. Check the address and the code.".into(),
            (Self::ConnectedTo(address), Es) => format!("Conectado a {address}."),
            (Self::ConnectedTo(address), En) => format!("Connected to {address}."),
            (Self::ConnectFailed, Es) => "No se pudo conectar. Revisa la dirección y que el teléfono esté en la misma red Wi-Fi.".into(),
            (Self::ConnectFailed, En) => "Could not connect. Check the address and that the phone is on the same Wi-Fi network.".into(),
            (Self::InstallFailed, Es) => "No se pudo instalar el APK.".into(),
            (Self::InstallFailed, En) => "Could not install the APK.".into(),
            (Self::DisconnectedFrom(address), Es) => format!("Desconectado de {address}."),
            (Self::DisconnectedFrom(address), En) => format!("Disconnected from {address}."),
            (Self::ScrcpyMissing(path), Es) => format!("Falta scrcpy-server. Ejecuta `./scripts/setup-scrcpy.sh`. Ruta: {path}"),
            (Self::ScrcpyMissing(path), En) => format!("scrcpy-server is missing. Run `./scripts/setup-scrcpy.sh`. Path: {path}"),
            (Self::MirrorStartFailed, Es) => "No se pudo iniciar la duplicación.".into(),
            (Self::MirrorStartFailed, En) => "Could not start mirroring.".into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locale_defaults_to_spanish() {
        assert_eq!(Locale::from_tag("es-NI"), Locale::Es);
        assert_eq!(Locale::from_tag("fr"), Locale::Es);
        assert_eq!(Locale::from_tag("en-US"), Locale::En);
        assert_eq!(Locale::from_tag("EN"), Locale::En);
    }

    #[test]
    fn messages_fill_in_their_parameter() {
        assert_eq!(
            Msg::ConnectedTo("192.168.1.5:5555").text(Locale::Es),
            "Conectado a 192.168.1.5:5555."
        );
        assert_eq!(
            Msg::DisconnectedFrom("10.0.0.2:5555").text(Locale::En),
            "Disconnected from 10.0.0.2:5555."
        );
    }
}
