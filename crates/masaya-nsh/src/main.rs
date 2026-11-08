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
    let exit = platform::run_app(
        platform::AppSource::Rust(platform::Root::of::<masaya_nsh::App>()),
        platform::AppOptions {
            title: "Masaya".to_owned(),
            app_id: masaya_nsh::APP_ID.to_owned(),
            size: (420, 800),
            components,
            // Closing the list hides it: the mirror windows stay, and the Dock brings it back.
            keep_alive_on_close: true,
            ..Default::default()
        },
    );
    // ⌘Q: every mirror window closes and its session with it, before the process ends.
    masaya_nsh::macos::windows::close_all();
    exit
}

#[cfg(not(target_os = "macos"))]
compile_error!("masaya-nsh is a macOS spike: run it on macOS 14+ (Apple Silicon).");
