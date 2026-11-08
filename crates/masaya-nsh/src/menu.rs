//! The app's menu bar as plain data: menus, items, their shortcuts and what they do. Ports
//! `app-menu.ts` with the mirror's actions added: while the video has the keyboard every key goes
//! to the phone, so each toolbar action has a menu item and a shortcut (menu shortcuts are
//! handled before the view sees the key). `macos/menu.rs` builds the `NSMenu` from it.

use crate::i18n::Key;
use crate::mirror::actions::{DeviceKey, PhoneAction};
use crate::settings::Settings;

/// The app's name, as the first menu's title.
pub const APP_NAME: &str = "Masaya";

/// A setting a menu item turns on and off, with a check mark.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Toggle {
    AlwaysOnTop,
    ShowClicks,
    NavigationBar,
}

impl Toggle {
    pub fn is_on(self, settings: &Settings) -> bool {
        match self {
            Self::AlwaysOnTop => settings.always_on_top,
            Self::ShowClicks => settings.show_clicks,
            Self::NavigationBar => settings.navigation_bar,
        }
    }

    /// Turns it the other way.
    pub fn flip(self, settings: &mut Settings) {
        let value = !self.is_on(settings);
        match self {
            Self::AlwaysOnTop => settings.always_on_top = value,
            Self::ShowClicks => settings.show_clicks = value,
            Self::NavigationBar => settings.navigation_bar = value,
        }
    }
}

/// What an item does.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Command {
    // AppKit's own, sent down the responder chain.
    About,
    Hide,
    HideOthers,
    ShowAll,
    Quit,
    Undo,
    Redo,
    Cut,
    Copy,
    Paste,
    SelectAll,
    Minimize,
    Close,
    BringAllToFront,
    // The app's.
    /// Enters or leaves full screen; its title says which (AppKit would rename it in English).
    FullScreen,
    /// Loads the device list again.
    Refresh,
    /// Acts on the phone of the key mirror window.
    Phone(PhoneAction),
    Toggle(Toggle),
    /// Shows the device list's window.
    ShowDevices,
}

impl Command {
    /// It acts on the key mirror window: disabled while the list (or nothing) is key.
    pub fn mirror_only(self) -> bool {
        matches!(self, Self::Phone(_))
    }
}

/// A key equivalent: `key` (a character, or one of AppKit's function-key characters such as
/// [`RIGHT_ARROW`]) with Command and the modifiers set.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Shortcut {
    pub key: char,
    pub shift: bool,
    pub option: bool,
    pub control: bool,
}

/// AppKit's `NSUpArrowFunctionKey`, `NSDownArrowFunctionKey`, `NSLeftArrowFunctionKey` and
/// `NSRightArrowFunctionKey`.
pub const UP_ARROW: char = '\u{F700}';
pub const DOWN_ARROW: char = '\u{F701}';
pub const LEFT_ARROW: char = '\u{F702}';
pub const RIGHT_ARROW: char = '\u{F703}';

impl Shortcut {
    /// How macOS writes it: the modifiers in their order (⌃⌥⇧⌘), then the key ("⇧⌘P").
    pub fn label(self) -> String {
        let mut label = String::new();
        for (on, symbol) in [
            (self.control, '⌃'),
            (self.option, '⌥'),
            (self.shift, '⇧'),
            (true, '⌘'),
        ] {
            if on {
                label.push(symbol);
            }
        }
        match self.key {
            UP_ARROW => label.push('↑'),
            DOWN_ARROW => label.push('↓'),
            LEFT_ARROW => label.push('←'),
            RIGHT_ARROW => label.push('→'),
            key => label.extend(key.to_uppercase()),
        }
        label
    }
}

const fn cmd(key: char) -> Option<Shortcut> {
    Some(Shortcut {
        key,
        shift: false,
        option: false,
        control: false,
    })
}

const fn cmd_shift(key: char) -> Option<Shortcut> {
    Some(Shortcut {
        key,
        shift: true,
        option: false,
        control: false,
    })
}

const fn cmd_option(key: char) -> Option<Shortcut> {
    Some(Shortcut {
        key,
        shift: false,
        option: true,
        control: false,
    })
}

const fn cmd_control(key: char) -> Option<Shortcut> {
    Some(Shortcut {
        key,
        shift: false,
        option: false,
        control: true,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Entry {
    Item {
        title: Key,
        command: Command,
        shortcut: Option<Shortcut>,
    },
    /// A shortcut with no item of its own (a second key for an item's command): built as a
    /// hidden item whose key equivalent still works.
    Hidden {
        command: Command,
        shortcut: Shortcut,
    },
    Separator,
}

const fn item(title: Key, command: Command, shortcut: Option<Shortcut>) -> Entry {
    Entry::Item {
        title,
        command,
        shortcut,
    }
}

const fn phone(title: Key, action: PhoneAction, shortcut: Option<Shortcut>) -> Entry {
    item(title, Command::Phone(action), shortcut)
}

const fn device_key(title: Key, key: DeviceKey, shortcut: Option<Shortcut>) -> Entry {
    phone(title, PhoneAction::Key(key), shortcut)
}

/// A menu of the bar. The first one is titled with the app's name (`title` `None`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Menu {
    pub title: Option<Key>,
    pub entries: Vec<Entry>,
    /// The Window menu: AppKit lists the open windows in it.
    pub windows: bool,
}

/// The menu bar, as `buildDarwinMenu` had it plus the Device menu's mirror actions.
pub fn menu_bar() -> Vec<Menu> {
    use Entry::Separator;
    vec![
        Menu {
            title: None,
            entries: vec![
                item(Key::MenuAbout, Command::About, None),
                Separator,
                item(Key::MenuHide, Command::Hide, cmd('h')),
                item(Key::MenuHideOthers, Command::HideOthers, cmd_option('h')),
                item(Key::MenuShowAll, Command::ShowAll, None),
                Separator,
                item(Key::MenuQuit, Command::Quit, cmd('q')),
            ],
            windows: false,
        },
        Menu {
            title: Some(Key::MenuEdit),
            entries: vec![
                item(Key::MenuUndo, Command::Undo, cmd('z')),
                item(Key::MenuRedo, Command::Redo, cmd_shift('z')),
                Separator,
                item(Key::MenuCut, Command::Cut, cmd('x')),
                item(Key::MenuCopy, Command::Copy, cmd('c')),
                item(Key::MenuPaste, Command::Paste, cmd('v')),
                item(Key::MenuSelectAll, Command::SelectAll, cmd('a')),
            ],
            windows: false,
        },
        Menu {
            title: Some(Key::MenuDevice),
            entries: vec![
                item(Key::MenuRefresh, Command::Refresh, cmd('r')),
                Separator,
                phone(Key::MenuRotate, PhoneAction::Rotate, cmd(RIGHT_ARROW)),
                // scrcpy has one rotate (it turns the screen 90°): ⌘← does the same as ⌘→.
                Entry::Hidden {
                    command: Command::Phone(PhoneAction::Rotate),
                    shortcut: Shortcut {
                        key: LEFT_ARROW,
                        shift: false,
                        option: false,
                        control: false,
                    },
                },
                device_key(Key::MenuVolumeUp, DeviceKey::VolumeUp, cmd(UP_ARROW)),
                device_key(Key::MenuVolumeDown, DeviceKey::VolumeDown, cmd(DOWN_ARROW)),
                // ⇧⌘P: ⌘P is printing in every Mac app.
                device_key(Key::MenuPower, DeviceKey::Power, cmd_shift('p')),
                Separator,
                // Escape is Back on the video; Home and Recents have the navigation bar.
                device_key(Key::MenuBack, DeviceKey::Back, None),
                device_key(Key::MenuHome, DeviceKey::Home, None),
                device_key(Key::MenuRecents, DeviceKey::Recents, None),
                Separator,
                item(
                    Key::MenuAlwaysOnTop,
                    Command::Toggle(Toggle::AlwaysOnTop),
                    cmd_shift('t'),
                ),
                item(
                    Key::MenuShowClicks,
                    Command::Toggle(Toggle::ShowClicks),
                    None,
                ),
                item(
                    Key::MenuNavigationBar,
                    Command::Toggle(Toggle::NavigationBar),
                    None,
                ),
            ],
            windows: false,
        },
        Menu {
            title: Some(Key::MenuView),
            entries: vec![item(
                Key::MenuFullScreen,
                Command::FullScreen,
                cmd_control('f'),
            )],
            windows: false,
        },
        Menu {
            title: Some(Key::MenuWindow),
            entries: vec![
                item(Key::MenuMinimize, Command::Minimize, cmd('m')),
                item(Key::MenuClose, Command::Close, cmd('w')),
                Separator,
                item(Key::MenuDevices, Command::ShowDevices, cmd('0')),
                Separator,
                item(Key::MenuBringAllToFront, Command::BringAllToFront, None),
            ],
            windows: true,
        },
    ]
}

/// Every item of the bar, in order.
pub fn items() -> Vec<(Key, Command, Option<Shortcut>)> {
    menu_bar()
        .into_iter()
        .flat_map(|menu| menu.entries)
        .filter_map(|entry| match entry {
            Entry::Item {
                title,
                command,
                shortcut,
            } => Some((title, command, shortcut)),
            Entry::Hidden { .. } | Entry::Separator => None,
        })
        .collect()
}

/// Every shortcut of the bar, the hidden ones too, with what it does.
pub fn shortcuts() -> Vec<(Shortcut, Command)> {
    menu_bar()
        .into_iter()
        .flat_map(|menu| menu.entries)
        .filter_map(|entry| match entry {
            Entry::Item {
                command,
                shortcut: Some(shortcut),
                ..
            }
            | Entry::Hidden { command, shortcut } => Some((shortcut, command)),
            _ => None,
        })
        .collect()
}

/// The shortcut of the item that does `command` (the toolbar's tooltips show it).
pub fn shortcut_of(command: Command) -> Option<Shortcut> {
    items()
        .into_iter()
        .find(|(_, found, _)| *found == command)
        .and_then(|(_, _, shortcut)| shortcut)
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    /// The video takes every key: what the toolbar does must be reachable with a shortcut.
    #[test]
    fn every_toolbar_action_has_a_menu_item_with_a_shortcut() {
        for command in [
            Command::Phone(PhoneAction::Key(DeviceKey::VolumeUp)),
            Command::Phone(PhoneAction::Key(DeviceKey::VolumeDown)),
            Command::Phone(PhoneAction::Key(DeviceKey::Power)),
            Command::Phone(PhoneAction::Rotate),
            Command::FullScreen,
        ] {
            assert!(shortcut_of(command).is_some(), "{command:?}");
        }
    }

    #[test]
    fn the_navigation_keys_are_in_the_menu() {
        for key in [DeviceKey::Back, DeviceKey::Home, DeviceKey::Recents] {
            let command = Command::Phone(PhoneAction::Key(key));
            assert!(items().iter().any(|(_, found, _)| *found == command));
        }
    }

    #[test]
    fn no_two_items_share_a_shortcut_or_a_title() {
        let items = items();
        let shortcuts: Vec<Shortcut> = shortcuts().into_iter().map(|(s, _)| s).collect();
        let unique: HashSet<Shortcut> = shortcuts.iter().copied().collect();
        assert_eq!(unique.len(), shortcuts.len());
        let titles: HashSet<Key> = items.iter().map(|(title, _, _)| *title).collect();
        assert_eq!(titles.len(), items.len());
    }

    #[test]
    fn shortcuts_read_as_macos_writes_them() {
        assert_eq!(shortcut_of(Command::Refresh).unwrap().label(), "⌘R");
        assert_eq!(
            shortcut_of(Command::Phone(PhoneAction::Key(DeviceKey::Power)))
                .unwrap()
                .label(),
            "⇧⌘P"
        );
        assert_eq!(shortcut_of(Command::FullScreen).unwrap().label(), "⌃⌘F");
        assert_eq!(shortcut_of(Command::HideOthers).unwrap().label(), "⌥⌘H");
        assert_eq!(
            shortcut_of(Command::Phone(PhoneAction::Rotate))
                .unwrap()
                .label(),
            "⌘→"
        );
    }

    #[test]
    fn rotate_answers_both_arrows() {
        let rotate: Vec<String> = shortcuts()
            .into_iter()
            .filter(|(_, command)| *command == Command::Phone(PhoneAction::Rotate))
            .map(|(shortcut, _)| shortcut.label())
            .collect();
        assert_eq!(rotate, ["⌘→", "⌘←"]);
    }

    #[test]
    fn the_shortcuts_the_app_promises() {
        assert_eq!(shortcut_of(Command::Refresh), cmd('r'));
        assert_eq!(shortcut_of(Command::FullScreen), cmd_control('f'));
        assert_eq!(shortcut_of(Command::Close), cmd('w'));
        assert_eq!(shortcut_of(Command::ShowDevices), cmd('0'));
        assert_eq!(shortcut_of(Command::Quit), cmd('q'));
    }

    #[test]
    fn only_the_phone_actions_need_a_mirror_window() {
        for (title, command, _) in items() {
            assert_eq!(
                command.mirror_only(),
                matches!(command, Command::Phone(_)),
                "{title:?}"
            );
        }
        assert!(!Command::Toggle(Toggle::AlwaysOnTop).mirror_only());
        assert!(!Command::Refresh.mirror_only());
    }

    #[test]
    fn toggles_flip_their_own_setting() {
        let mut settings = Settings::default();
        for toggle in [
            Toggle::AlwaysOnTop,
            Toggle::ShowClicks,
            Toggle::NavigationBar,
        ] {
            let before = settings.clone();
            let was = toggle.is_on(&settings);
            toggle.flip(&mut settings);
            assert_eq!(toggle.is_on(&settings), !was, "{toggle:?}");
            toggle.flip(&mut settings);
            assert_eq!(settings, before, "{toggle:?}");
        }
    }

    #[test]
    fn the_window_menu_is_the_last_and_lists_the_windows() {
        let bar = menu_bar();
        assert_eq!(bar.first().unwrap().title, None);
        assert!(bar.last().unwrap().windows);
        assert_eq!(bar.iter().filter(|menu| menu.windows).count(), 1);
    }
}
