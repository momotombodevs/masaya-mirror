//! The menu bar, built with AppKit from [`crate::menu`] in the app's language. It replaces the
//! English menu NSH's `run_app` sets: NSH's own menus (`SetMenu`) belong to one view's engine,
//! and these items act across windows.
//!
//! AppKit's items (About, Edit, Minimize, Close, full screen…) go down the responder chain. The
//! app's go to one target: the phone's actions to the key mirror window's screen (disabled while
//! the list is key), the toggles to the settings (saved off the main thread; every window
//! follows them through `SettingsHub`), Refresh to the list.

use std::cell::RefCell;

use objc2::rc::Retained;
use objc2::runtime::{Bool, NSObjectProtocol, Sel};
use objc2::{MainThreadMarker, MainThreadOnly, define_class, msg_send, sel};
use objc2_app_kit::{
    NSApplication, NSControlStateValueOff, NSControlStateValueOn, NSEventModifierFlags, NSMenu,
    NSMenuItem, NSWindowStyleMask,
};
use objc2_foundation::{NSObject, NSString};

use super::windows;
use crate::i18n::{Key, t};
use crate::menu::{APP_NAME, Command, Entry, Shortcut, menu_bar};
use crate::settings::SettingsHub;
use crate::windows::{OpenMirrors, WindowEvent};

thread_local! {
    /// The app's commands, by item tag (index + 1).
    static COMMANDS: RefCell<Vec<Command>> = const { RefCell::new(Vec::new()) };
    /// The items' target, kept: a menu item holds its target weakly.
    static TARGET: RefCell<Option<Retained<MenuTarget>>> = const { RefCell::new(None) };
}

fn command_of(item: &NSMenuItem) -> Option<Command> {
    let index = usize::try_from(item.tag()).ok()?.checked_sub(1)?;
    COMMANDS.with(|commands| commands.borrow().get(index).copied())
}

define_class!(
    /// Carries out the app's own menu commands.
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "MasayaMenuTarget"]
    struct MenuTarget;

    unsafe impl NSObjectProtocol for MenuTarget {}

    impl MenuTarget {
        #[unsafe(method(menuCommand:))]
        fn menu_command(&self, item: &NSMenuItem) {
            if let Some(command) = command_of(item) {
                run(MainThreadMarker::from(self), command);
            }
        }

        #[unsafe(method(validateMenuItem:))]
        fn validate_menu_item(&self, item: &NSMenuItem) -> Bool {
            Bool::new(validate(MainThreadMarker::from(self), item))
        }
    }
);

/// Whether an item of the app's can be chosen now; sets the check mark of a toggle.
fn validate(mtm: MainThreadMarker, item: &NSMenuItem) -> bool {
    let Some(command) = command_of(item) else {
        return true;
    };
    if command == Command::FullScreen {
        // Its title says what it does, in the app's language (AppKit renames only its own
        // `toggleFullScreen:` items, and in English).
        let key = NSApplication::sharedApplication(mtm).keyWindow();
        let full = key
            .as_ref()
            .is_some_and(|window| window.styleMask().contains(NSWindowStyleMask::FullScreen));
        let title = t(if full {
            Key::MenuExitFullScreen
        } else {
            Key::MenuFullScreen
        });
        item.setTitle(&NSString::from_str(title));
        return key.is_some();
    }
    if let Command::Toggle(toggle) = command {
        let on = SettingsHub::global().with_settings(|settings| toggle.is_on(settings));
        item.setState(if on {
            NSControlStateValueOn
        } else {
            NSControlStateValueOff
        });
    }
    // The phone's items, as the toolbar's buttons: only while the key window's video runs.
    !command.mirror_only()
        || windows::key_mirror(mtm)
            .is_some_and(|(serial, generation, mirrors)| mirrors.is_running(&serial, generation))
}

/// Carries out one of the app's commands (AppKit's own never get here).
fn run(mtm: MainThreadMarker, command: Command) {
    match command {
        Command::Phone(action) => match windows::key_mirror(mtm) {
            Some((serial, generation, mirrors)) => {
                log::debug!("menu: {action:?} on {serial}");
                mirrors.send(&serial, generation, WindowEvent::Phone(action));
            }
            None => log::debug!("menu: {action:?} with no mirror window key"),
        },
        Command::Toggle(toggle) => {
            log::info!("menu: toggling {toggle:?}");
            // Saving writes the file: off the main thread.
            let spawned = std::thread::Builder::new()
                .name("masaya-settings".to_owned())
                .spawn(move || {
                    SettingsHub::global().update(|settings| toggle.flip(settings));
                });
            if let Err(error) = spawned {
                log::error!("menu: could not save {toggle:?}: {error}");
            }
        }
        Command::FullScreen => {
            if let Some(window) = NSApplication::sharedApplication(mtm).keyWindow() {
                window.toggleFullScreen(None);
            }
        }
        Command::Refresh => OpenMirrors::global().request_refresh(),
        Command::ShowDevices => windows::show_devices(mtm),
        _ => log::warn!("menu: {command:?} has no handler of the app"),
    }
}

/// AppKit's action for its own commands; `None` for the app's.
fn standard_action(command: Command) -> Option<Sel> {
    Some(match command {
        Command::About => sel!(orderFrontStandardAboutPanel:),
        Command::Hide => sel!(hide:),
        Command::HideOthers => sel!(hideOtherApplications:),
        Command::ShowAll => sel!(unhideAllApplications:),
        Command::Quit => sel!(terminate:),
        Command::Undo => sel!(undo:),
        Command::Redo => sel!(redo:),
        Command::Cut => sel!(cut:),
        Command::Copy => sel!(copy:),
        Command::Paste => sel!(paste:),
        Command::SelectAll => sel!(selectAll:),
        Command::Minimize => sel!(performMiniaturize:),
        Command::Close => sel!(performClose:),
        Command::BringAllToFront => sel!(arrangeInFront:),
        Command::FullScreen
        | Command::Refresh
        | Command::Phone(_)
        | Command::Toggle(_)
        | Command::ShowDevices => {
            return None;
        }
    })
}

fn modifiers(shortcut: Shortcut) -> NSEventModifierFlags {
    let mut flags = NSEventModifierFlags::Command;
    if shortcut.shift {
        flags |= NSEventModifierFlags::Shift;
    }
    if shortcut.option {
        flags |= NSEventModifierFlags::Option;
    }
    if shortcut.control {
        flags |= NSEventModifierFlags::Control;
    }
    flags
}

/// Builds the menu bar and makes it the app's; remembers the list's window. Call it on the main
/// queue once NSH's app runs: `main.rs` queues it before `run_app`, whose menu it replaces.
pub fn install() {
    let Some(mtm) = MainThreadMarker::new() else {
        log::error!("the menu must be installed on the main thread");
        return;
    };
    windows::remember_list(mtm);
    let app = NSApplication::sharedApplication(mtm);
    let target: Retained<MenuTarget> = unsafe { msg_send![MenuTarget::alloc(mtm), init] };
    let mut commands = Vec::new();
    let bar = NSMenu::new(mtm);
    for menu in menu_bar() {
        let title = menu.title.map_or(APP_NAME, t);
        let submenu = NSMenu::initWithTitle(NSMenu::alloc(mtm), &NSString::from_str(title));
        // AppKit enables items whose target answers; the app's are validated by the target.
        submenu.setAutoenablesItems(true);
        for entry in menu.entries {
            let (title, command, shortcut, hidden) = match entry {
                Entry::Item {
                    title,
                    command,
                    shortcut,
                } => (t(title), command, shortcut, false),
                Entry::Hidden { command, shortcut } => ("", command, Some(shortcut), true),
                Entry::Separator => {
                    submenu.addItem(&NSMenuItem::separatorItem(mtm));
                    continue;
                }
            };
            let key = shortcut.map(|shortcut| shortcut.key.to_string());
            let action = standard_action(command).unwrap_or(sel!(menuCommand:));
            // SAFETY: the actions are AppKit's standard ones (sent down the responder chain) or
            // `menuCommand:` of the target, which `TARGET` keeps alive.
            let item = unsafe {
                NSMenuItem::initWithTitle_action_keyEquivalent(
                    NSMenuItem::alloc(mtm),
                    &NSString::from_str(title),
                    Some(action),
                    &NSString::from_str(key.as_deref().unwrap_or("")),
                )
            };
            if let Some(shortcut) = shortcut {
                item.setKeyEquivalentModifierMask(modifiers(shortcut));
            }
            if standard_action(command).is_none() {
                commands.push(command);
                item.setTag(commands.len() as isize);
                // SAFETY: the target answers `menuCommand:` and is kept in `TARGET`.
                unsafe { item.setTarget(Some(&target)) };
            }
            if hidden {
                // Out of sight, but its key equivalent still works (macOS 13+).
                item.setHidden(true);
                item.setAllowsKeyEquivalentWhenHidden(true);
            }
            submenu.addItem(&item);
        }
        let holder = NSMenuItem::new(mtm);
        holder.setTitle(&NSString::from_str(title));
        holder.setSubmenu(Some(&submenu));
        bar.addItem(&holder);
        if menu.windows {
            app.setWindowsMenu(Some(&submenu));
        }
    }
    COMMANDS.with(|slot| *slot.borrow_mut() = commands);
    TARGET.with(|slot| *slot.borrow_mut() = Some(target));
    app.setMainMenu(Some(&bar));
}
