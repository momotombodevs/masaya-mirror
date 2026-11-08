//! H.264 from scrcpy (Annex-B: NAL units after `00 00 01` / `00 00 00 01` start codes) into what
//! VideoToolbox and `AVSampleBufferDisplayLayer` take: the SPS and PPS for the format description,
//! and each frame as AVCC (every NAL unit after its length as a 4-byte big-endian number).
//!
//! The bytes inside a NAL unit, emulation-prevention bytes included, are copied as they are.
//! Malformed input is an error, never a panic: it comes from the phone.

use thiserror::Error;

pub const NAL_SPS: u8 = 7;
pub const NAL_PPS: u8 = 8;
pub const NAL_AUD: u8 = 9;

/// An SPS shorter than this lacks the profile, constraints and level the format needs.
const MIN_SPS_LEN: usize = 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum H264Error {
    #[error("no H.264 start code in the packet")]
    NoStartCode,
    #[error("the packet has no NAL unit to decode")]
    Empty,
    #[error("the codec configuration has no SPS")]
    MissingSps,
    #[error("the codec configuration has no PPS")]
    MissingPps,
    #[error("the SPS is truncated")]
    TruncatedSps,
    #[error("a NAL unit is larger than 4 GiB")]
    TooLarge,
}

/// The NAL units of an Annex-B stream, without their start codes or the zero bytes that pad
/// them. Bytes before the first start code are ignored; empty units are skipped.
pub fn split_annexb(data: &[u8]) -> Result<Vec<&[u8]>, H264Error> {
    let mut starts = Vec::new();
    let mut i = 0;
    while i + 3 <= data.len() {
        if data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 1 {
            starts.push(i);
            i += 3;
        } else {
            i += 1;
        }
    }
    if starts.is_empty() {
        return Err(H264Error::NoStartCode);
    }

    let mut units = Vec::with_capacity(starts.len());
    for (index, &start) in starts.iter().enumerate() {
        let begin = start + 3;
        let end = starts.get(index + 1).copied().unwrap_or(data.len());
        // A 4-byte start code's leading zero and trailing_zero_8bits end up here: drop them.
        let unit = trim_trailing_zeros(&data[begin..end]);
        if !unit.is_empty() {
            units.push(unit);
        }
    }
    Ok(units)
}

fn trim_trailing_zeros(unit: &[u8]) -> &[u8] {
    let len = unit
        .iter()
        .rposition(|&byte| byte != 0)
        .map_or(0, |last| last + 1);
    &unit[..len]
}

/// `nal_unit_type`, the low five bits of the header byte. `None` for an empty unit.
pub fn nal_type(unit: &[u8]) -> Option<u8> {
    unit.first().map(|header| header & 0x1f)
}

/// The parameter sets of a stream, from scrcpy's codec configuration packet.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParameterSets {
    pub sps: Vec<u8>,
    pub pps: Vec<u8>,
}

impl ParameterSets {
    /// The first SPS and the first PPS of the configuration packet.
    pub fn from_config(config: &[u8]) -> Result<Self, H264Error> {
        let units = split_annexb(config)?;
        let find = |kind| units.iter().find(|unit| nal_type(unit) == Some(kind));
        let sps = find(NAL_SPS).ok_or(H264Error::MissingSps)?;
        if sps.len() < MIN_SPS_LEN {
            return Err(H264Error::TruncatedSps);
        }
        let pps = find(NAL_PPS).ok_or(H264Error::MissingPps)?;
        Ok(Self {
            sps: sps.to_vec(),
            pps: pps.to_vec(),
        })
    }
}

/// Writes the frame in `annexb` to `out` (cleared first, so one buffer serves every frame) as
/// AVCC. Access unit delimiters and repeated SPS/PPS are dropped: the format description
/// already carries the parameter sets, and a new configuration packet replaces it.
pub fn to_avcc(annexb: &[u8], out: &mut Vec<u8>) -> Result<(), H264Error> {
    out.clear();
    for unit in split_annexb(annexb)? {
        if matches!(nal_type(unit), Some(NAL_AUD | NAL_SPS | NAL_PPS)) {
            continue;
        }
        let len = u32::try_from(unit.len()).map_err(|_| H264Error::TooLarge)?;
        out.extend_from_slice(&len.to_be_bytes());
        out.extend_from_slice(unit);
    }
    if out.is_empty() {
        return Err(H264Error::Empty);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SPS: &[u8] = &[0x67, 0x42, 0xc0, 0x1f, 0xda, 0x01];
    const PPS: &[u8] = &[0x68, 0xce, 0x3c, 0x80];
    const IDR: &[u8] = &[0x65, 0x88, 0x84, 0x00, 0x00, 0x03, 0x01, 0x21];
    const AUD: &[u8] = &[0x09, 0xf0];

    fn annexb(units: &[&[u8]], four_byte: bool) -> Vec<u8> {
        let mut out = Vec::new();
        for unit in units {
            if four_byte {
                out.push(0);
            }
            out.extend_from_slice(&[0, 0, 1]);
            out.extend_from_slice(unit);
        }
        out
    }

    #[test]
    fn splits_three_and_four_byte_start_codes() {
        for four_byte in [false, true] {
            let data = annexb(&[SPS, PPS, IDR], four_byte);
            assert_eq!(split_annexb(&data).unwrap(), vec![SPS, PPS, IDR]);
        }
        let mut mixed = annexb(&[SPS], true);
        mixed.extend(annexb(&[PPS], false));
        assert_eq!(split_annexb(&mixed).unwrap(), vec![SPS, PPS]);
    }

    #[test]
    fn drops_trailing_zero_bytes_and_empty_units() {
        let mut data = annexb(&[SPS], true);
        data.extend_from_slice(&[0, 0, 0]);
        data.extend(annexb(&[PPS], true));
        data.extend_from_slice(&[0, 0, 1, 0, 0, 1]);
        data.extend_from_slice(&[0, 0]);
        assert_eq!(split_annexb(&data).unwrap(), vec![SPS, PPS]);
    }

    #[test]
    fn keeps_emulation_prevention_bytes() {
        // `00 00 03 01` inside the IDR is not a start code and stays as it is.
        let data = annexb(&[IDR], true);
        assert_eq!(split_annexb(&data).unwrap(), vec![IDR]);
    }

    #[test]
    fn input_without_a_start_code_is_an_error() {
        assert_eq!(split_annexb(&[]), Err(H264Error::NoStartCode));
        assert_eq!(split_annexb(&[0, 0]), Err(H264Error::NoStartCode));
        assert_eq!(split_annexb(&[0x65, 1, 2, 3]), Err(H264Error::NoStartCode));
    }

    #[test]
    fn reads_the_nal_type() {
        assert_eq!(nal_type(SPS), Some(NAL_SPS));
        assert_eq!(nal_type(PPS), Some(NAL_PPS));
        assert_eq!(nal_type(IDR), Some(5));
        assert_eq!(nal_type(&[]), None);
    }

    #[test]
    fn parameter_sets_come_from_the_config_packet() {
        let config = annexb(&[SPS, PPS], true);
        assert_eq!(
            ParameterSets::from_config(&config).unwrap(),
            ParameterSets {
                sps: SPS.to_vec(),
                pps: PPS.to_vec()
            }
        );
    }

    #[test]
    fn a_config_without_sps_or_pps_or_with_a_short_sps_is_an_error() {
        assert_eq!(
            ParameterSets::from_config(&annexb(&[PPS], true)),
            Err(H264Error::MissingSps)
        );
        assert_eq!(
            ParameterSets::from_config(&annexb(&[SPS], true)),
            Err(H264Error::MissingPps)
        );
        assert_eq!(
            ParameterSets::from_config(&annexb(&[&[0x67, 0x42], PPS], true)),
            Err(H264Error::TruncatedSps)
        );
        assert_eq!(ParameterSets::from_config(&[]), Err(H264Error::NoStartCode));
    }

    #[test]
    fn avcc_prefixes_each_unit_with_its_length() {
        let slice: &[u8] = &[0x41, 0x9a, 0x00];
        let mut out = vec![0xff; 3]; // a reused buffer is cleared
        to_avcc(&annexb(&[IDR, slice], true), &mut out).unwrap();
        let mut expected = vec![0, 0, 0, IDR.len() as u8];
        expected.extend_from_slice(IDR);
        // The slice's trailing zero is padding, so it is trimmed.
        expected.extend_from_slice(&[0, 0, 0, 2, 0x41, 0x9a]);
        assert_eq!(out, expected);
    }

    #[test]
    fn avcc_drops_delimiters_and_parameter_sets() {
        let mut out = Vec::new();
        to_avcc(&annexb(&[AUD, SPS, PPS, IDR], false), &mut out).unwrap();
        let mut expected = vec![0, 0, 0, IDR.len() as u8];
        expected.extend_from_slice(IDR);
        assert_eq!(out, expected);
    }

    #[test]
    fn avcc_of_nothing_to_decode_is_an_error() {
        let mut out = Vec::new();
        assert_eq!(to_avcc(&[], &mut out), Err(H264Error::NoStartCode));
        assert_eq!(
            to_avcc(&annexb(&[AUD], true), &mut out),
            Err(H264Error::Empty)
        );
        assert_eq!(to_avcc(&[0, 0, 0, 1], &mut out), Err(H264Error::Empty));
    }
}
