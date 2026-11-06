//! A phone's marketing name. Ports `device-name.ts`.

/// Properties that hold a phone's marketing name, best first. Xiaomi fills the `marketname` pair,
/// Oppo/OnePlus/Realme the `oplus` one and Huawei `marketing_name`. `ro.product.model` is the last
/// resort: friendly on Pixels and Motorolas, a code ("SM-S918B") on Samsungs.
pub const DEVICE_NAME_PROPS: [&str; 5] = [
    "ro.product.marketname",
    "ro.product.vendor.marketname",
    "ro.vendor.oplus.market.name",
    "ro.config.marketing_name",
    "ro.product.model",
];

/// One `adb shell` call that prints `prop=value` for every name property, empty when unset.
pub fn device_name_shell_command() -> String {
    format!(
        "for p in {}; do echo \"$p=$(getprop $p)\"; done",
        DEVICE_NAME_PROPS.join(" ")
    )
}

/// Samsung never sets a marketing name property, so its model codes are mapped here. The key is
/// the code without the region suffix: SM-S918B, SM-S918U and SM-S918N are all an S23 Ultra.
const SAMSUNG_MODELS: &[(&str, &str)] = &[
    ("G780", "Galaxy S20 FE"),
    ("G781", "Galaxy S20 FE 5G"),
    ("G980", "Galaxy S20"),
    ("G981", "Galaxy S20 5G"),
    ("G985", "Galaxy S20+"),
    ("G986", "Galaxy S20+ 5G"),
    ("G988", "Galaxy S20 Ultra"),
    ("G990", "Galaxy S21 FE"),
    ("G991", "Galaxy S21"),
    ("G996", "Galaxy S21+"),
    ("G998", "Galaxy S21 Ultra"),
    ("S901", "Galaxy S22"),
    ("S906", "Galaxy S22+"),
    ("S908", "Galaxy S22 Ultra"),
    ("S711", "Galaxy S23 FE"),
    ("S911", "Galaxy S23"),
    ("S916", "Galaxy S23+"),
    ("S918", "Galaxy S23 Ultra"),
    ("S721", "Galaxy S24 FE"),
    ("S921", "Galaxy S24"),
    ("S926", "Galaxy S24+"),
    ("S928", "Galaxy S24 Ultra"),
    ("S731", "Galaxy S25 FE"),
    ("S931", "Galaxy S25"),
    ("S936", "Galaxy S25+"),
    ("S937", "Galaxy S25 Edge"),
    ("S938", "Galaxy S25 Ultra"),
    ("F711", "Galaxy Z Flip3"),
    ("F926", "Galaxy Z Fold3"),
    ("F721", "Galaxy Z Flip4"),
    ("F936", "Galaxy Z Fold4"),
    ("F731", "Galaxy Z Flip5"),
    ("F946", "Galaxy Z Fold5"),
    ("F741", "Galaxy Z Flip6"),
    ("F956", "Galaxy Z Fold6"),
    ("F761", "Galaxy Z Flip7 FE"),
    ("F766", "Galaxy Z Flip7"),
    ("F966", "Galaxy Z Fold7"),
    ("A135", "Galaxy A13"),
    ("A145", "Galaxy A14"),
    ("A146", "Galaxy A14 5G"),
    ("A155", "Galaxy A15"),
    ("A156", "Galaxy A15 5G"),
    ("A165", "Galaxy A16"),
    ("A166", "Galaxy A16 5G"),
    ("A245", "Galaxy A24"),
    ("A256", "Galaxy A25"),
    ("A266", "Galaxy A26"),
    ("A336", "Galaxy A33"),
    ("A346", "Galaxy A34"),
    ("A356", "Galaxy A35"),
    ("A366", "Galaxy A36"),
    ("A525", "Galaxy A52"),
    ("A526", "Galaxy A52 5G"),
    ("A528", "Galaxy A52s"),
    ("A536", "Galaxy A53"),
    ("A546", "Galaxy A54"),
    ("A556", "Galaxy A55"),
    ("A566", "Galaxy A56"),
    ("A725", "Galaxy A72"),
];

/// `SM-` or `SM_` followed by a letter and three digits, case-insensitive. `adb devices -l` turns
/// every dash into an underscore, so "SM_S918B" and "SM-S918B" both match.
fn samsung_code(model: &str) -> Option<String> {
    let bytes = model.as_bytes();
    let matches = bytes.len() >= 7
        && bytes[..2].eq_ignore_ascii_case(b"SM")
        && matches!(bytes[2], b'-' | b'_')
        && bytes[3].is_ascii_alphabetic()
        && bytes[4..7].iter().all(u8::is_ascii_digit);
    matches.then(|| model[3..7].to_ascii_uppercase())
}

/// The marketing name for a model code, or the model itself when it is not a known Samsung.
pub fn friendly_model_name(model: &str) -> String {
    samsung_code(model)
        .and_then(|code| {
            SAMSUNG_MODELS
                .iter()
                .find(|(key, _)| *key == code)
                .map(|(_, name)| (*name).to_owned())
        })
        .unwrap_or_else(|| model.to_owned())
}

/// Picks the best name from the output of [`device_name_shell_command`], if any.
pub fn parse_device_name(stdout: &str) -> Option<String> {
    let values: Vec<(&str, &str)> = stdout
        .lines()
        .filter_map(|line| {
            let (key, value) = line.split_once('=')?;
            (!key.is_empty()).then_some((key.trim(), value.trim()))
        })
        .collect();
    DEVICE_NAME_PROPS
        .iter()
        .find_map(|prop| {
            values
                .iter()
                .rev()
                .find(|(key, _)| key == prop)
                .map(|(_, value)| *value)
                .filter(|value| !value.is_empty())
        })
        .map(friendly_model_name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_samsung_codes_with_any_region_suffix_and_separator() {
        assert_eq!(friendly_model_name("SM-S918B"), "Galaxy S23 Ultra");
        assert_eq!(friendly_model_name("SM_S918U"), "Galaxy S23 Ultra");
        assert_eq!(friendly_model_name("sm-a556e"), "Galaxy A55");
    }

    #[test]
    fn leaves_unknown_models_alone() {
        assert_eq!(friendly_model_name("Pixel_8"), "Pixel_8");
        assert_eq!(friendly_model_name("SM-X999"), "SM-X999");
        assert_eq!(friendly_model_name("SM"), "SM");
    }

    #[test]
    fn prefers_marketing_names_over_the_model() {
        let out = "ro.product.marketname=\nro.product.vendor.marketname=Redmi Note 12\n\
            ro.vendor.oplus.market.name=\nro.config.marketing_name=\nro.product.model=23021RAA2Y\n";
        assert_eq!(parse_device_name(out).as_deref(), Some("Redmi Note 12"));
    }

    #[test]
    fn falls_back_to_the_model_and_maps_it() {
        let out = "ro.product.marketname=\nro.product.model=SM-S918B\n";
        assert_eq!(parse_device_name(out).as_deref(), Some("Galaxy S23 Ultra"));
        assert_eq!(parse_device_name("ro.product.model=\n"), None);
        assert_eq!(parse_device_name(""), None);
    }

    #[test]
    fn the_shell_command_lists_every_property() {
        let command = device_name_shell_command();
        for prop in DEVICE_NAME_PROPS {
            assert!(command.contains(prop));
        }
        assert!(command.starts_with("for p in "));
    }
}
