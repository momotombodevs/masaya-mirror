//! macOS-only pieces: the native views the app registers and the mirror windows.

pub mod input_view;
pub mod mirror_view;
pub mod windows;

use std::rc::Rc;

use nsh_platform_macos::{ComponentContext, Components, NativeComponent};
use objc2::MainThreadMarker;

use crate::screens::mirror::MIRROR_COMPONENT;

/// Registers the app's native components: by `main.rs` for `cargo run`, and by the hosts
/// `nsh run` and `nsh package` build, through `#[native_components(macos)]` in `lib.rs`.
pub fn register(components: &Components) {
    // Hosts register (and make views) on the main thread.
    let Some(mtm) = MainThreadMarker::new() else {
        log::error!("native components must be registered on the main thread");
        return;
    };
    components.register(
        MIRROR_COMPONENT,
        Rc::new(
            move |context: ComponentContext| -> Box<dyn NativeComponent> {
                Box::new(mirror_view::MirrorView::new(context, mtm))
            },
        ),
    );
}
