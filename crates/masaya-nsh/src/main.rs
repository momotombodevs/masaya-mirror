//! Runs Masaya directly on macOS (`cargo run -p masaya-nsh`).

#[cfg(target_os = "macos")]
fn main() -> impl std::process::Termination {
    use nsh_platform_macos as platform;

    // The terminal (`RUST_LOG`) and `~/Library/Logs/Masaya/nsh.log`; with metrics on, the
    // measurements' lines whatever `RUST_LOG` says.
    masaya_nsh::logging::init(masaya_nsh::metrics::enabled());
    let components = platform::Components::default();
    masaya_nsh::macos::register(&components);
    platform::run_app(
        platform::AppSource::Rust(platform::Root::of::<masaya_nsh::App>()),
        platform::AppOptions {
            title: "Masaya".to_owned(),
            app_id: "dev.momotombo.app.masayamirror".to_owned(),
            size: (420, 800),
            components,
            ..Default::default()
        },
    )
}

#[cfg(not(target_os = "macos"))]
compile_error!("masaya-nsh is a macOS spike: run it on macOS 14+ (Apple Silicon).");
