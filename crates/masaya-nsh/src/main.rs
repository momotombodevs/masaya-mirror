//! Runs Masaya directly on macOS (`cargo run -p masaya-nsh`).

#[cfg(target_os = "macos")]
fn main() -> impl std::process::Termination {
    use nsh_platform_macos as platform;

    let mut logger = env_logger::Builder::from_default_env();
    if masaya_nsh::metrics::enabled() {
        // The measurements' lines, whatever `RUST_LOG` says.
        logger.filter_module("masaya::", log::LevelFilter::Info);
    }
    logger.init();
    let components = platform::Components::default();
    masaya_nsh::macos::register(&components);
    platform::run_app(
        platform::AppSource::Rust(platform::Root::of::<masaya_nsh::App>()),
        platform::AppOptions {
            title: "Masaya".to_owned(),
            app_id: "com.masaya.app.nsh".to_owned(),
            size: (420, 800),
            components,
            ..Default::default()
        },
    )
}

#[cfg(not(target_os = "macos"))]
compile_error!("masaya-nsh is a macOS spike: run it on macOS 14+ (Apple Silicon).");
