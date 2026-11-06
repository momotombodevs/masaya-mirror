//! Talking to adb: the command line (`cli`) for one-shot commands, and the server protocol
//! (`protocol`) for the long-lived streams scrcpy needs.

pub mod cli;
pub mod device;
pub mod device_name;
pub mod path;
pub mod protocol;

pub use cli::AdbCli;
pub use device::{AndroidDevice, DeviceSettingKey, DeviceSettings, DeviceStatus, MdnsService};
pub use protocol::AdbServer;
