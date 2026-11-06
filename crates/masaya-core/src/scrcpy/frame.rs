//! How a mirror stream travels from Rust to the webview.
//!
//! JSON would turn every video frame into a list of numbers, so the stream is sent as raw bytes
//! (a Tauri `Channel` can carry an `ArrayBuffer`). The renderer decodes the same layout in
//! `src/renderer/src/shared/tauri/stream-frame.ts`; the two must change together.
//!
//! ```text
//! init         0x00 | JSON { deviceId, video: {codec,width,height}, audioCodec, audioWebCodecId }
//! video config 0x01 | codec configuration bytes
//! video data   0x02 | flags u8 (bit 0 = keyframe) | pts u64 BE, microseconds | frame bytes
//! audio config 0x03 | codec configuration bytes
//! audio data   0x04 | flags u8                    | pts u64 BE                | frame bytes
//! close        0x05 | UTF-8 reason (may be empty)
//! ```

use serde::Serialize;

use super::stream::{MediaPacket, VideoCodecId};

pub mod tag {
    pub const INIT: u8 = 0;
    pub const VIDEO_CONFIG: u8 = 1;
    pub const VIDEO_DATA: u8 = 2;
    pub const AUDIO_CONFIG: u8 = 3;
    pub const AUDIO_DATA: u8 = 4;
    pub const CLOSE: u8 = 5;
}

const KEYFRAME: u8 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Track {
    Video,
    Audio,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct VideoMetadata {
    pub codec: VideoCodecId,
    pub width: u32,
    pub height: u32,
}

/// The first frame of a stream: what the renderer needs to set up its decoders.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Init<'a> {
    pub device_id: &'a str,
    pub video: VideoMetadata,
    pub audio_codec: Option<&'a str>,
    pub audio_web_codec_id: Option<&'a str>,
}

pub fn encode_init(init: &Init<'_>) -> Vec<u8> {
    let mut out = vec![tag::INIT];
    // Serializing plain strings and numbers cannot fail.
    out.extend(serde_json::to_vec(init).unwrap_or_default());
    out
}

pub fn encode_packet(track: Track, packet: &MediaPacket) -> Vec<u8> {
    match packet {
        MediaPacket::Configuration { data } => {
            let mut out = Vec::with_capacity(1 + data.len());
            out.push(match track {
                Track::Video => tag::VIDEO_CONFIG,
                Track::Audio => tag::AUDIO_CONFIG,
            });
            out.extend_from_slice(data);
            out
        }
        MediaPacket::Data {
            keyframe,
            pts,
            data,
        } => {
            let mut out = Vec::with_capacity(10 + data.len());
            out.push(match track {
                Track::Video => tag::VIDEO_DATA,
                Track::Audio => tag::AUDIO_DATA,
            });
            out.push(if *keyframe { KEYFRAME } else { 0 });
            out.extend_from_slice(&pts.to_be_bytes());
            out.extend_from_slice(data);
            out
        }
    }
}

pub fn encode_close(reason: Option<&str>) -> Vec<u8> {
    let mut out = vec![tag::CLOSE];
    out.extend_from_slice(reason.unwrap_or_default().as_bytes());
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn init_is_a_tag_followed_by_the_json_the_renderer_expects() {
        let frame = encode_init(&Init {
            device_id: "R5CT",
            video: VideoMetadata {
                codec: VideoCodecId::H264,
                width: 1080,
                height: 2400,
            },
            audio_codec: Some("audio/opus"),
            audio_web_codec_id: Some("opus"),
        });
        assert_eq!(frame[0], tag::INIT);
        let json: serde_json::Value = serde_json::from_slice(&frame[1..]).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "deviceId": "R5CT",
                "video": { "codec": 0x6832_3634u32, "width": 1080, "height": 2400 },
                "audioCodec": "audio/opus",
                "audioWebCodecId": "opus",
            })
        );
    }

    #[test]
    fn missing_audio_is_null_not_absent() {
        let frame = encode_init(&Init {
            device_id: "d",
            video: VideoMetadata {
                codec: VideoCodecId::H265,
                width: 1,
                height: 1,
            },
            audio_codec: None,
            audio_web_codec_id: None,
        });
        let json: serde_json::Value = serde_json::from_slice(&frame[1..]).unwrap();
        assert!(json["audioCodec"].is_null() && json["audioWebCodecId"].is_null());
    }

    #[test]
    fn a_data_packet_carries_flags_pts_and_bytes() {
        let packet = MediaPacket::Data {
            keyframe: true,
            pts: 0x0102_0304_0506_0708,
            data: vec![9, 8, 7],
        };
        assert_eq!(
            encode_packet(Track::Video, &packet),
            [2, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 8, 7]
        );
        let delta = MediaPacket::Data {
            keyframe: false,
            pts: 1,
            data: vec![],
        };
        assert_eq!(
            encode_packet(Track::Audio, &delta),
            [4, 0, 0, 0, 0, 0, 0, 0, 0, 1]
        );
    }

    #[test]
    fn configuration_is_a_tag_and_the_bytes() {
        let config = MediaPacket::Configuration {
            data: vec![0, 0, 1],
        };
        assert_eq!(encode_packet(Track::Video, &config), [1, 0, 0, 1]);
        assert_eq!(encode_packet(Track::Audio, &config), [3, 0, 0, 1]);
    }

    #[test]
    fn close_carries_an_optional_reason() {
        assert_eq!(encode_close(None), [5]);
        assert_eq!(encode_close(Some("fin")), [5, b'f', b'i', b'n']);
    }
}
