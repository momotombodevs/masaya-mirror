//! The `masaya.mirror` native view: an `NSView` hosting an `AVSampleBufferDisplayLayer`, which
//! decodes H.264 with VideoToolbox (in hardware on Apple Silicon) and draws each frame as soon as
//! it arrives. The layer keeps the video's aspect ratio (`resizeAspect`), the same letterbox
//! `input::mapping` maps through.
//!
//! Props: `session` (the key the screen registered the session under). Events: `attached`
//! (`{ session }`), once the view takes that session's frames.

use std::ffi::c_void;
use std::ptr::{self, NonNull};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use nsh_platform_macos::{ComponentContext, NativeComponent};
use objc2::MainThreadMarker;
use objc2::rc::Retained;
use objc2::runtime::{NSObjectProtocol, ProtocolObject};
use objc2_foundation::{NSActivityOptions, NSProcessInfo, NSString};
use objc2_app_kit::NSView;

use super::input_view::MirrorNSView;
use objc2_av_foundation::{
    AVLayerVideoGravityResizeAspect, AVQueuedSampleBufferRendering,
    AVQueuedSampleBufferRenderingStatus, AVSampleBufferDisplayLayer, AVSampleBufferVideoRenderer,
    AVVideoPerformanceMetrics,
};
use objc2_core_foundation::{
    CFArray, CFDictionary, CFMutableDictionary, CFRetained, kCFBooleanTrue,
};
use objc2_core_media::{
    CMBlockBuffer, CMFormatDescription, CMSampleBuffer,
    CMVideoFormatDescriptionCreateFromH264ParameterSets, CMVideoFormatDescriptionGetDimensions,
    kCMBlockBufferAssureMemoryNowFlag, kCMSampleAttachmentKey_DisplayImmediately,
};
use serde_json::{Value, json};
use thiserror::Error;

use crate::metrics;
use crate::mirror::h264::{self, H264Error, ParameterSets};
use crate::mirror::sink::{self, FrameSink};

#[derive(Debug, Error)]
enum DecodeError {
    #[error(transparent)]
    H264(#[from] H264Error),
    #[error("{call} failed with status {status}")]
    CoreMedia { call: &'static str, status: i32 },
}

fn check(call: &'static str, status: i32) -> Result<(), DecodeError> {
    if status == 0 {
        Ok(())
    } else {
        Err(DecodeError::CoreMedia { call, status })
    }
}

/// The layer's renderer, used from the pump's thread.
///
/// SAFETY: Apple documents `sampleBufferRenderer` (macOS 14+) as the way to "safely enqueue
/// sample buffers from a background thread". Every call also goes through the `Mutex` in
/// [`LayerSink`], so they never run at the same time. The layer itself stays with the view on
/// the main thread.
struct SendRenderer(Retained<AVSampleBufferVideoRenderer>);

unsafe impl Send for SendRenderer {}

/// The format description for the current parameter sets.
///
/// SAFETY: a `CMFormatDescription` is an immutable CoreFoundation object, safe to share.
struct SendFormat(CFRetained<CMFormatDescription>);

unsafe impl Send for SendFormat {}

struct Decoder {
    renderer: SendRenderer,
    format: Option<SendFormat>,
    /// One AVCC buffer, reused for every frame.
    avcc: Vec<u8>,
    /// Frames before a keyframe cannot be decoded after a new configuration.
    waiting_for_keyframe: bool,
    stats: SinkStats,
}

/// What a sink did with the packets it got: for logs, tests and the measurements of slice 5.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct SinkStats {
    pub configurations: u64,
    pub enqueued: u64,
    /// Dropped while waiting for a keyframe, before a configuration, or because they could not
    /// be turned into a sample buffer.
    pub dropped: u64,
    /// Times the renderer had failed and was flushed.
    pub renderer_failures: u64,
    /// Frames the renderer was not ready for (dropped until the next keyframe).
    pub not_ready: u64,
    /// Frames that could not be marked to show at once (they still show, maybe later).
    pub unmarked: u64,
    /// Frames that could not be turned into a sample buffer.
    pub invalid: u64,
}

/// Logs the 1st, 2nd, 4th, 8th… occurrence: a problem on every frame would flood the log.
fn worth_logging(count: u64) -> bool {
    count.is_power_of_two()
}

/// Turns scrcpy's packets into sample buffers for the layer.
pub struct LayerSink {
    decoder: Mutex<Decoder>,
    /// The video's size from the current configuration, `width << 32 | height` (0 before the
    /// first): the view maps its input through it, and it changes when the phone rotates.
    video_size: Arc<AtomicU64>,
}

/// Reads a size [`LayerSink`] stored.
pub fn unpack_size(packed: u64) -> (u32, u32) {
    ((packed >> 32) as u32, packed as u32)
}

impl LayerSink {
    /// A sink feeding `renderer` (a display layer's `sampleBufferRenderer`).
    pub fn new(renderer: Retained<AVSampleBufferVideoRenderer>) -> Self {
        Self {
            decoder: Mutex::new(Decoder {
                renderer: SendRenderer(renderer),
                format: None,
                avcc: Vec::new(),
                waiting_for_keyframe: true,
                stats: SinkStats::default(),
            }),
            video_size: Arc::new(AtomicU64::new(0)),
        }
    }

    /// The video's size as the stream describes it, shared with the view.
    pub fn video_size(&self) -> Arc<AtomicU64> {
        self.video_size.clone()
    }

    pub fn stats(&self) -> SinkStats {
        self.decoder().stats
    }

    /// The renderer's status: `Failed` after a frame it could not decode.
    pub fn failed(&self) -> bool {
        let decoder = self.decoder();
        let status = unsafe { decoder.renderer.0.status() };
        status == AVQueuedSampleBufferRenderingStatus::Failed
    }

    fn decoder(&self) -> std::sync::MutexGuard<'_, Decoder> {
        self.decoder
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

impl FrameSink for LayerSink {
    fn configure(&self, config: &[u8]) {
        let mut decoder = self.decoder();
        match format_description(config) {
            Ok(format) => {
                // SAFETY: a valid H.264 format description.
                let size = unsafe { CMVideoFormatDescriptionGetDimensions(&format) };
                let (width, height) = (size.width.max(0) as u64, size.height.max(0) as u64);
                self.video_size
                    .store(width << 32 | height, Ordering::Relaxed);
                decoder.format = Some(SendFormat(format));
                decoder.stats.configurations += 1;
                decoder.waiting_for_keyframe = true;
                // A new stream (the phone rotated): drop what was queued for the old one.
                unsafe { decoder.renderer.0.flush() };
            }
            Err(error) => log::warn!("mirror: bad codec configuration: {error}"),
        }
    }

    fn frame(&self, data: &[u8], keyframe: bool) {
        let mut decoder = self.decoder();
        if decoder.waiting_for_keyframe && !keyframe {
            decoder.stats.dropped += 1;
            return;
        }
        let Some(format) = decoder.format.as_ref().map(|format| format.0.clone()) else {
            decoder.stats.dropped += 1;
            return;
        };
        let mut avcc = std::mem::take(&mut decoder.avcc);
        let result = h264::to_avcc(data, &mut avcc)
            .map_err(DecodeError::from)
            .and_then(|()| sample_buffer(&avcc, &format));
        decoder.avcc = avcc;
        match result {
            Ok((sample, marked)) => {
                if !marked {
                    decoder.stats.unmarked += 1;
                    if worth_logging(decoder.stats.unmarked) {
                        log::warn!(
                            "mirror: could not mark a frame to show at once ({} so far)",
                            decoder.stats.unmarked
                        );
                    }
                }
                let renderer = decoder.renderer.0.clone();
                // After a decode error the renderer stops until flushed.
                if unsafe { renderer.status() } == AVQueuedSampleBufferRenderingStatus::Failed {
                    log::warn!("mirror: the video renderer failed; flushing");
                    unsafe { renderer.flush() };
                    decoder.stats.renderer_failures += 1;
                    if !keyframe {
                        decoder.waiting_for_keyframe = true;
                        decoder.stats.dropped += 1;
                        return;
                    }
                }
                // A renderer that is behind gets no more deltas: they would queue up latency.
                // The next keyframe starts it again.
                if !keyframe && !unsafe { renderer.isReadyForMoreMediaData() } {
                    decoder.waiting_for_keyframe = true;
                    decoder.stats.dropped += 1;
                    decoder.stats.not_ready += 1;
                    return;
                }
                unsafe { renderer.enqueueSampleBuffer(&sample) };
                decoder.waiting_for_keyframe = false;
                decoder.stats.enqueued += 1;
            }
            Err(error) => {
                decoder.stats.dropped += 1;
                decoder.stats.invalid += 1;
                if worth_logging(decoder.stats.invalid) {
                    log::warn!(
                        "mirror: frame dropped: {error} ({} so far)",
                        decoder.stats.invalid
                    );
                }
            }
        }
    }
}

/// The format description of an H.264 stream, from its SPS and PPS.
fn format_description(config: &[u8]) -> Result<CFRetained<CMFormatDescription>, DecodeError> {
    let sets = ParameterSets::from_config(config)?;
    let pointers = [NonNull::from(&sets.sps[0]), NonNull::from(&sets.pps[0])];
    let sizes = [sets.sps.len(), sets.pps.len()];
    let mut out: *const CMFormatDescription = ptr::null();
    // SAFETY: two parameter sets, both non-empty (`from_config` checks), outliving the call;
    // `out` is written on success.
    let status = unsafe {
        CMVideoFormatDescriptionCreateFromH264ParameterSets(
            None,
            pointers.len(),
            NonNull::from(&pointers[0]),
            NonNull::from(&sizes[0]),
            4,
            NonNull::from(&mut out),
        )
    };
    check(
        "CMVideoFormatDescriptionCreateFromH264ParameterSets",
        status,
    )?;
    let out = NonNull::new(out.cast_mut()).ok_or(DecodeError::CoreMedia {
        call: "CMVideoFormatDescriptionCreateFromH264ParameterSets",
        status,
    })?;
    // SAFETY: a "Create" function: we own the reference it returned.
    Ok(unsafe { CFRetained::from_raw(out) })
}

/// One AVCC frame as a sample buffer the layer shows as soon as it is decoded.
/// One AVCC frame as a sample buffer, and whether it could be marked to show at once.
fn sample_buffer(
    avcc: &[u8],
    format: &CMFormatDescription,
) -> Result<(CFRetained<CMSampleBuffer>, bool), DecodeError> {
    // The block buffer allocates and owns a copy, so `avcc` can be reused at once.
    let mut block: *mut CMBlockBuffer = ptr::null_mut();
    // SAFETY: no memory block given, so CoreMedia allocates `avcc.len()` bytes; `block` is
    // written on success.
    let status = unsafe {
        CMBlockBuffer::create_with_memory_block(
            None,
            ptr::null_mut(),
            avcc.len(),
            None,
            ptr::null(),
            0,
            avcc.len(),
            kCMBlockBufferAssureMemoryNowFlag,
            NonNull::from(&mut block),
        )
    };
    check("CMBlockBufferCreateWithMemoryBlock", status)?;
    let block = NonNull::new(block).ok_or(DecodeError::CoreMedia {
        call: "CMBlockBufferCreateWithMemoryBlock",
        status,
    })?;
    // SAFETY: a "Create" function: we own the reference.
    let block = unsafe { CFRetained::from_raw(block) };
    // SAFETY: the block holds exactly `avcc.len()` bytes; `avcc` is non-empty (`to_avcc` checks).
    let status = unsafe {
        CMBlockBuffer::replace_data_bytes(
            NonNull::from(&avcc[0]).cast::<c_void>(),
            &block,
            0,
            avcc.len(),
        )
    };
    check("CMBlockBufferReplaceDataBytes", status)?;

    let size = avcc.len();
    let mut sample: *mut CMSampleBuffer = ptr::null_mut();
    // SAFETY: one sample of `size` bytes with no timing (it is shown immediately, below);
    // `sample` is written on success.
    let status = unsafe {
        CMSampleBuffer::create_ready(
            None,
            Some(&block),
            Some(format),
            1,
            0,
            ptr::null(),
            1,
            &size,
            NonNull::from(&mut sample),
        )
    };
    check("CMSampleBufferCreateReady", status)?;
    let sample = NonNull::new(sample).ok_or(DecodeError::CoreMedia {
        call: "CMSampleBufferCreateReady",
        status,
    })?;
    // SAFETY: a "Create" function: we own the reference.
    let sample = unsafe { CFRetained::from_raw(sample) };
    let marked = display_immediately(&sample);
    Ok((sample, marked))
}

/// Marks the sample to be shown as soon as it is decoded: the phone's own timing would add
/// latency, and the mirror wants the newest frame now.
///
/// The samples carry no timing, so a sample that could not be marked still shows: the layer
/// presents untimed samples as they come. The mark makes that explicit.
fn display_immediately(sample: &CMSampleBuffer) -> bool {
    // SAFETY: the array has one mutable dictionary per sample (`true` creates it).
    unsafe {
        let Some(attachments) = sample.sample_attachments_array(true) else {
            return false;
        };
        let attachments: &CFArray = &attachments;
        if attachments.count() < 1 {
            return false;
        }
        let dictionary =
            attachments.value_at_index(0) as *const CFDictionary as *const CFMutableDictionary;
        let Some(dictionary) = dictionary.as_ref() else {
            return false;
        };
        let Some(yes) = kCFBooleanTrue else {
            return false;
        };
        CFMutableDictionary::set_value(
            Some(dictionary),
            kCMSampleAttachmentKey_DisplayImmediately as *const _ as *const c_void,
            yes as *const _ as *const c_void,
        );
        true
    }
}

/// Frames the renderer has shown so far (its total less the ones it dropped), from
/// `loadVideoPerformanceMetrics`; `None` when it has no metrics or does not answer in 50 ms.
///
/// The layer decodes and displays inside AVFoundation, and `copyDisplayedPixelBuffer` is no
/// help: it hands back a new object on every call and its picture changes only a couple of
/// times a second. This counter is the only per-frame signal the public API gives.
fn shown_frames(renderer: &AVSampleBufferVideoRenderer) -> Option<i64> {
    let (sender, receiver) = std::sync::mpsc::sync_channel::<Option<i64>>(1);
    let block = block2::RcBlock::new(move |metrics: *mut AVVideoPerformanceMetrics| {
        // SAFETY: AVFoundation passes a valid metrics object or nil for the call's duration.
        let shown = unsafe { metrics.as_ref() }.map(|metrics| unsafe {
            (metrics.totalNumberOfFrames() - metrics.numberOfDroppedFrames()) as i64
        });
        let _ = sender.try_send(shown);
    });
    // SAFETY: the block only sends on a channel, so it is sendable.
    unsafe { renderer.loadVideoPerformanceMetricsWithCompletionHandler(&block) };
    receiver
        .recv_timeout(std::time::Duration::from_millis(50))
        .ok()
        .flatten()
}

/// Watches what the layer shows, for [`metrics`]: polls the renderer's shown-frame count
/// ([`shown_frames`]) every 2 ms and reports each rise as a presented frame. Runs only with metrics on, until
/// the view goes.
struct PresentProbe {
    stop: Arc<AtomicBool>,
}

impl PresentProbe {
    fn start(renderer: Retained<AVSampleBufferVideoRenderer>) -> Option<Self> {
        let stop = Arc::new(AtomicBool::new(false));
        let stopped = stop.clone();
        let renderer = SendRenderer(renderer);
        let spawned = std::thread::Builder::new()
            .name("masaya-present-probe".to_owned())
            .spawn(move || {
                let renderer = renderer;
                let mut shown: Option<i64> = None;
                while !stopped.load(Ordering::Relaxed) {
                    if let Some(now) = shown_frames(&renderer.0) {
                        if shown.is_some_and(|before| now > before) {
                            metrics::presented(std::time::Instant::now());
                        }
                        shown = Some(now);
                    }
                    std::thread::sleep(std::time::Duration::from_millis(2));
                }
            });
        match spawned {
            Ok(_) => Some(Self { stop }),
            Err(error) => {
                log::warn!(target: metrics::TARGET, "present probe did not start: {error}");
                None
            }
        }
    }
}

impl Drop for PresentProbe {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}

/// Keeps macOS from napping the app while a mirror is open. App Nap throttles a process whose
/// windows are covered: after about 40 s behind other windows the control writer woke up only
/// every ~100 ms, input reached the phone in bursts and it drew at ~50 fps instead of ~118.
/// Chromium does the same for Electron.
struct NoNap(Retained<ProtocolObject<dyn NSObjectProtocol>>);

impl NoNap {
    fn begin() -> Self {
        let info = NSProcessInfo::processInfo();
        Self(info.beginActivityWithOptions_reason(
            NSActivityOptions::UserInitiatedAllowingIdleSystemSleep
                | NSActivityOptions::LatencyCritical,
            &NSString::from_str("Mirroring a phone"),
        ))
    }
}

impl Drop for NoNap {
    fn drop(&mut self) {
        // SAFETY: the token is the one `beginActivityWithOptions:reason:` returned, ended once.
        unsafe { NSProcessInfo::processInfo().endActivity(&self.0) };
    }
}

/// The native view: the video, and the input that goes back to the phone
/// ([`super::input_view`]).
pub struct MirrorView {
    view: Retained<MirrorNSView>,
    sink: Arc<dyn FrameSink>,
    context: ComponentContext,
    session: Option<String>,
    _probe: Option<PresentProbe>,
    _no_nap: NoNap,
}

impl MirrorView {
    pub fn new(context: ComponentContext, mtm: MainThreadMarker) -> Self {
        // SAFETY: plain object creation and configuration on the main thread.
        let layer = unsafe { AVSampleBufferDisplayLayer::new() };
        if let Some(gravity) = unsafe { AVLayerVideoGravityResizeAspect } {
            unsafe { layer.setVideoGravity(gravity) };
        }
        let renderer = unsafe { layer.sampleBufferRenderer() };
        // `MASAYA_NO_PROBE=1`: metrics without the present probe, to see what the probe costs.
        let probe = (metrics::enabled() && !metrics::is_on(metrics::env_value("MASAYA_NO_PROBE").as_deref()))
            .then(|| PresentProbe::start(renderer.clone()))
            .flatten();
        let sink = Arc::new(LayerSink::new(renderer));
        if metrics::enabled() {
            let counted = sink.clone();
            metrics::set_renderer_failures(Some(Box::new(move || {
                counted.stats().renderer_failures
            })));
        }
        let view = MirrorNSView::new(mtm, sink.video_size());
        // A layer-hosting view: the layer is set first, then wanted, so AppKit keeps its frame
        // at the view's bounds and never draws into it.
        view.setLayer(Some(&layer));
        view.setWantsLayer(true);
        Self {
            view,
            sink,
            context,
            session: None,
            _probe: probe,
            _no_nap: NoNap::begin(),
        }
    }

    fn detach(&mut self) {
        self.view.set_input(None);
        if let Some(old) = self.session.take() {
            sink::registry().detach(&old, &self.sink);
        }
    }
}

impl NativeComponent for MirrorView {
    fn view(&self) -> Retained<NSView> {
        Retained::into_super(self.view.clone())
    }

    fn set_prop(&mut self, name: &str, value: Option<&Value>) {
        if name != "session" {
            return;
        }
        let session = value.and_then(Value::as_str).map(str::to_owned);
        if session == self.session {
            return;
        }
        self.detach();
        if let Some(key) = session {
            sink::registry().attach(&key, self.sink.clone());
            self.view.set_input(sink::registry().input(&key));
            self.context.emit("attached", json!({ "session": key }));
            self.session = Some(key);
        }
    }
}

impl Drop for MirrorView {
    fn drop(&mut self) {
        self.detach();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // A real 64×64 baseline stream (x264), so CoreMedia accepts its parameter sets.
    const SPS: &[u8] = &[
        0x67, 0x42, 0xc0, 0x0a, 0xdc, 0x42, 0x6c, 0x04, 0x40, 0x00, 0x00, 0x03, 0x00, 0x40, 0x00,
        0x00, 0x03, 0x00, 0x83, 0xc4, 0x89, 0xe0,
    ];
    const PPS: &[u8] = &[0x68, 0xce, 0x0f, 0x2c, 0x80];
    const IDR: &[u8] = &[
        0x65, 0x88, 0x84, 0x04, 0xbc, 0x98, 0xa0, 0x00, 0x38, 0xa3, 0x27, 0x27, 0x27, 0x5d, 0x75,
        0xd7, 0x5d, 0x75, 0xd7, 0x5d, 0x75, 0xd7, 0x80,
    ];
    /// A delta frame: what it holds does not matter, only that it is not a keyframe.
    const DELTA: &[u8] = &[0x41, 0x9a, 0x00, 0x01];

    fn annexb(units: &[&[u8]]) -> Vec<u8> {
        let mut out = Vec::new();
        for unit in units {
            out.extend_from_slice(&[0, 0, 0, 1]);
            out.extend_from_slice(unit);
        }
        out
    }

    fn sink() -> LayerSink {
        // SAFETY: plain object creation; the layer is never shown.
        let layer = unsafe { AVSampleBufferDisplayLayer::new() };
        LayerSink::new(unsafe { layer.sampleBufferRenderer() })
    }

    #[test]
    fn frames_wait_for_a_configuration_and_then_a_keyframe() {
        let sink = sink();
        sink.frame(&annexb(&[IDR]), true); // no configuration yet
        assert_eq!(sink.stats().dropped, 1);

        sink.configure(&annexb(&[SPS, PPS]));
        assert_eq!(sink.stats().configurations, 1);
        assert_eq!(
            unpack_size(sink.video_size().load(Ordering::Relaxed)),
            (64, 64)
        );

        sink.frame(&annexb(&[DELTA]), false); // before the keyframe: undecodable
        assert_eq!(sink.stats().dropped, 2);
        assert_eq!(sink.stats().enqueued, 0);

        sink.frame(&annexb(&[IDR]), true);
        assert_eq!(sink.stats().enqueued, 1);
    }

    #[test]
    fn a_new_configuration_waits_for_the_next_keyframe_again() {
        let sink = sink();
        sink.configure(&annexb(&[SPS, PPS]));
        sink.frame(&annexb(&[IDR]), true);
        assert_eq!(sink.stats().enqueued, 1);

        // The phone rotated: a new configuration, then deltas until its keyframe.
        sink.configure(&annexb(&[SPS, PPS]));
        sink.frame(&annexb(&[DELTA]), false);
        assert_eq!(sink.stats().enqueued, 1);
        assert_eq!(sink.stats().dropped, 1);
        sink.frame(&annexb(&[IDR]), true);
        assert_eq!(sink.stats().enqueued, 2);
        assert_eq!(sink.stats().configurations, 2);
    }

    #[test]
    fn a_bad_configuration_or_frame_is_counted_not_fatal() {
        let sink = sink();
        sink.configure(&annexb(&[PPS])); // no SPS
        assert_eq!(sink.stats().configurations, 0);
        sink.configure(&annexb(&[SPS, PPS]));
        sink.frame(&[0x65, 1, 2], true); // no start code
        assert_eq!(sink.stats().invalid, 1);
        assert!(worth_logging(1) && worth_logging(2) && !worth_logging(3) && worth_logging(64));
    }
}
