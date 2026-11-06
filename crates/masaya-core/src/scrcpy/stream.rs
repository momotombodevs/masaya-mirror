//! The video and audio sockets: a small header, then packets until the socket closes.

use serde::{Serialize, Serializer};
use tokio::io::{AsyncRead, AsyncReadExt};

use crate::error::AdbError;

/// Length of the device name the server sends first, padded with NUL bytes.
pub const DEVICE_NAME_LEN: usize = 64;
/// Set in a packet's `pts` word when it carries codec configuration (SPS/PPS or the like).
pub const PTS_CONFIG: u64 = 1 << 63;
/// Set in a packet's `pts` word when it is a keyframe.
pub const PTS_KEYFRAME: u64 = 1 << 62;
/// A real packet is far smaller; a bigger length means the stream is corrupt.
const MAX_PACKET_LEN: usize = 64 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VideoCodecId {
    H264,
    H265,
    Av1,
}

impl VideoCodecId {
    pub const fn id(self) -> u32 {
        match self {
            Self::H264 => 0x6832_3634,
            Self::H265 => 0x6832_3635,
            Self::Av1 => 0x0061_7631,
        }
    }

    fn from_id(id: u32) -> Option<Self> {
        [Self::H264, Self::H265, Self::Av1]
            .into_iter()
            .find(|codec| codec.id() == id)
    }
}

/// The renderer knows a codec by its number (`ScrcpyVideoCodecId`).
impl Serialize for VideoCodecId {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_u32(self.id())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VideoHeader {
    pub device_name: Option<String>,
    pub codec: VideoCodecId,
    pub width: u32,
    pub height: u32,
}

/// Reads what the server sends first on the video socket: the device name, then the codec and the
/// size of the first frame.
pub async fn read_video_header<R: AsyncRead + Unpin>(
    reader: &mut R,
    with_device_name: bool,
) -> Result<VideoHeader, AdbError> {
    let device_name = if with_device_name {
        let mut raw = [0u8; DEVICE_NAME_LEN];
        reader.read_exact(&mut raw).await?;
        let end = raw.iter().position(|byte| *byte == 0).unwrap_or(raw.len());
        Some(String::from_utf8_lossy(&raw[..end]).into_owned())
    } else {
        None
    };
    let codec_id = reader.read_u32().await?;
    let width = reader.read_u32().await?;
    let height = reader.read_u32().await?;
    let codec = VideoCodecId::from_id(codec_id)
        .ok_or_else(|| AdbError::Failed(format!("unknown video codec {codec_id:#x}")))?;
    Ok(VideoHeader {
        device_name,
        codec,
        width,
        height,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AudioCodec {
    Opus,
    Aac,
    Flac,
    Raw,
}

impl AudioCodec {
    const fn id(self) -> u32 {
        match self {
            Self::Opus => 0x6f70_7573,
            Self::Aac => 0x0061_6163,
            Self::Flac => 0x666c_6163,
            Self::Raw => 0x0072_6177,
        }
    }

    pub const fn mime_type(self) -> &'static str {
        match self {
            Self::Opus => "audio/opus",
            Self::Aac => "audio/aac",
            Self::Flac => "audio/flac",
            Self::Raw => "audio/raw",
        }
    }

    /// The codec string WebCodecs' `AudioDecoder` takes. Empty for raw PCM, which needs none.
    pub const fn web_codec_id(self) -> &'static str {
        match self {
            Self::Opus => "opus",
            Self::Aac => "mp4a.66",
            Self::Flac => "flac",
            Self::Raw => "",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AudioHeader {
    /// The server has no audio to send (the option is off, or the phone is older than Android 11).
    Disabled,
    /// The server tried to capture audio and failed.
    Errored,
    Codec(AudioCodec),
}

pub async fn read_audio_header<R: AsyncRead + Unpin>(
    reader: &mut R,
) -> Result<AudioHeader, AdbError> {
    match reader.read_u32().await? {
        0 => Ok(AudioHeader::Disabled),
        1 => Ok(AudioHeader::Errored),
        id => [
            AudioCodec::Opus,
            AudioCodec::Aac,
            AudioCodec::Flac,
            AudioCodec::Raw,
        ]
        .into_iter()
        .find(|codec| codec.id() == id)
        .map(AudioHeader::Codec)
        .ok_or_else(|| AdbError::Failed(format!("unknown audio codec {id:#x}"))),
    }
}

/// One frame (or one block of codec configuration) from the device.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MediaPacket {
    Configuration {
        data: Vec<u8>,
    },
    Data {
        keyframe: bool,
        /// Presentation time in microseconds, as the device stamped it.
        pts: u64,
        data: Vec<u8>,
    },
}

/// Reads the next packet: a 12-byte header (`pts` with flags, then the length) and the payload.
/// `None` means the device closed the socket cleanly between packets.
pub async fn read_packet<R: AsyncRead + Unpin>(
    reader: &mut R,
) -> Result<Option<MediaPacket>, AdbError> {
    let mut first = [0u8; 1];
    if reader.read(&mut first).await? == 0 {
        return Ok(None);
    }
    let mut rest = [0u8; 11];
    reader.read_exact(&mut rest).await?;

    let mut header = [0u8; 12];
    header[0] = first[0];
    header[1..].copy_from_slice(&rest);
    let pts_and_flags = u64::from_be_bytes(header[..8].try_into().expect("8 bytes"));
    let len = u32::from_be_bytes(header[8..].try_into().expect("4 bytes")) as usize;
    if len > MAX_PACKET_LEN {
        return Err(AdbError::Failed(format!(
            "packet of {len} bytes is not plausible"
        )));
    }

    let mut data = vec![0u8; len];
    reader.read_exact(&mut data).await?;

    Ok(Some(if pts_and_flags & PTS_CONFIG != 0 {
        MediaPacket::Configuration { data }
    } else {
        MediaPacket::Data {
            keyframe: pts_and_flags & PTS_KEYFRAME != 0,
            pts: pts_and_flags & !PTS_KEYFRAME,
            data,
        }
    }))
}

#[cfg(test)]
pub(crate) mod fixtures {
    use super::*;

    /// A packet as the server writes it.
    pub fn packet(pts_and_flags: u64, data: &[u8]) -> Vec<u8> {
        let mut out = pts_and_flags.to_be_bytes().to_vec();
        out.extend_from_slice(&(data.len() as u32).to_be_bytes());
        out.extend_from_slice(data);
        out
    }

    pub fn video_header(name: &str, codec: VideoCodecId, width: u32, height: u32) -> Vec<u8> {
        let mut out = vec![0u8; DEVICE_NAME_LEN];
        out[..name.len()].copy_from_slice(name.as_bytes());
        out.extend_from_slice(&codec.id().to_be_bytes());
        out.extend_from_slice(&width.to_be_bytes());
        out.extend_from_slice(&height.to_be_bytes());
        out
    }

    pub fn audio_header(codec: AudioCodec) -> Vec<u8> {
        codec.id().to_be_bytes().to_vec()
    }
}

#[cfg(test)]
mod tests {
    use super::fixtures::*;
    use super::*;

    #[tokio::test]
    async fn reads_the_video_header_with_a_nul_padded_name() {
        let bytes = video_header("Pixel 8", VideoCodecId::H264, 1080, 2400);
        let header = read_video_header(&mut &bytes[..], true).await.unwrap();
        assert_eq!(
            header,
            VideoHeader {
                device_name: Some("Pixel 8".into()),
                codec: VideoCodecId::H264,
                width: 1080,
                height: 2400
            }
        );
    }

    #[tokio::test]
    async fn the_name_is_optional_and_codecs_are_checked() {
        let bytes = video_header("x", VideoCodecId::H265, 10, 20)[DEVICE_NAME_LEN..].to_vec();
        let header = read_video_header(&mut &bytes[..], false).await.unwrap();
        assert_eq!(
            (header.device_name, header.codec),
            (None, VideoCodecId::H265)
        );

        let mut unknown = vec![0, 0, 0, 1];
        unknown.extend_from_slice(&[0; 8]);
        assert!(read_video_header(&mut &unknown[..], false).await.is_err());
    }

    #[test]
    fn codec_ids_match_their_ascii_names() {
        assert_eq!(VideoCodecId::H264.id().to_be_bytes(), *b"h264");
        assert_eq!(VideoCodecId::H265.id().to_be_bytes(), *b"h265");
        assert_eq!(VideoCodecId::Av1.id().to_be_bytes(), *b"\0av1");
        assert_eq!(AudioCodec::Opus.id().to_be_bytes(), *b"opus");
        assert_eq!(AudioCodec::Aac.id().to_be_bytes(), *b"\0aac");
        assert_eq!(AudioCodec::Flac.id().to_be_bytes(), *b"flac");
        assert_eq!(AudioCodec::Raw.id().to_be_bytes(), *b"\0raw");
    }

    #[test]
    fn the_renderer_receives_the_codec_as_a_number() {
        assert_eq!(
            serde_json::to_string(&VideoCodecId::H264).unwrap(),
            "1748121140"
        );
    }

    #[tokio::test]
    async fn audio_header_tells_disabled_errored_and_codecs_apart() {
        assert_eq!(
            read_audio_header(&mut &[0, 0, 0, 0][..]).await.unwrap(),
            AudioHeader::Disabled
        );
        assert_eq!(
            read_audio_header(&mut &[0, 0, 0, 1][..]).await.unwrap(),
            AudioHeader::Errored
        );
        assert_eq!(
            read_audio_header(&mut &audio_header(AudioCodec::Opus)[..])
                .await
                .unwrap(),
            AudioHeader::Codec(AudioCodec::Opus)
        );
        assert!(read_audio_header(&mut &b"nope"[..]).await.is_err());
        assert_eq!(AudioCodec::Opus.web_codec_id(), "opus");
        assert_eq!(AudioCodec::Aac.mime_type(), "audio/aac");
    }

    #[tokio::test]
    async fn packets_are_configuration_keyframes_or_deltas() {
        let mut bytes = packet(PTS_CONFIG, &[1, 2, 3]);
        bytes.extend(packet(PTS_KEYFRAME | 1_000, &[9; 4]));
        bytes.extend(packet(2_000, &[7]));
        let mut reader = &bytes[..];

        assert_eq!(
            read_packet(&mut reader).await.unwrap(),
            Some(MediaPacket::Configuration {
                data: vec![1, 2, 3]
            })
        );
        // The keyframe flag is separated from the timestamp.
        assert_eq!(
            read_packet(&mut reader).await.unwrap(),
            Some(MediaPacket::Data {
                keyframe: true,
                pts: 1_000,
                data: vec![9; 4]
            })
        );
        assert_eq!(
            read_packet(&mut reader).await.unwrap(),
            Some(MediaPacket::Data {
                keyframe: false,
                pts: 2_000,
                data: vec![7]
            })
        );
        assert_eq!(read_packet(&mut reader).await.unwrap(), None);
    }

    #[tokio::test]
    async fn an_empty_payload_is_a_valid_packet() {
        let bytes = packet(5, &[]);
        assert_eq!(
            read_packet(&mut &bytes[..]).await.unwrap(),
            Some(MediaPacket::Data {
                keyframe: false,
                pts: 5,
                data: vec![]
            })
        );
    }

    #[tokio::test]
    async fn a_truncated_packet_is_an_error_not_a_clean_end() {
        let mut bytes = packet(1, &[1, 2, 3, 4]);
        bytes.truncate(bytes.len() - 2);
        assert!(read_packet(&mut &bytes[..]).await.is_err());
        // A cut in the middle of the header is also an error.
        assert!(read_packet(&mut &bytes[..5]).await.is_err());
    }

    #[tokio::test]
    async fn an_implausible_length_is_refused_before_allocating() {
        let mut bytes = 1u64.to_be_bytes().to_vec();
        bytes.extend_from_slice(&u32::MAX.to_be_bytes());
        assert!(read_packet(&mut &bytes[..]).await.is_err());
    }
}
