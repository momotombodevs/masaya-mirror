//! The video path against a real phone: scrcpy session, packets, H.264 → CoreMedia → the display
//! layer's renderer. Needs a phone with USB debugging and `adb`:
//!
//! ```sh
//! MASAYA_TEST_SERIAL=$(adb get-serialno) cargo test -p masaya-nsh --test real_phone -- --ignored
//! ```
#![cfg(target_os = "macos")]

mod common;

use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use masaya_core::Locale;
use masaya_nsh::input::events::{Geometry, InputEvent, InputTranslator};
use masaya_nsh::input::mapping::{VideoSize, ViewSize};
use masaya_nsh::macos::mirror_view::LayerSink;
use masaya_nsh::mirror::control::forward_in_order;
use masaya_nsh::mirror::pump::pump;
use masaya_nsh::mirror::sink::{FrameSink, Registry};
use masaya_nsh::source::{AdbSource, DeviceSource};
use objc2_av_foundation::AVSampleBufferDisplayLayer;

/// How long the stream settles before the input, and how long it is watched after.
const SETTLE: Duration = Duration::from_secs(2);
const WATCH: Duration = Duration::from_secs(3);

/// Counts the packets while handing them to the sink.
struct Counting {
    inner: Arc<LayerSink>,
    packets: AtomicU64,
}

impl FrameSink for Counting {
    fn configure(&self, config: &[u8]) {
        self.packets.fetch_add(1, Ordering::Relaxed);
        self.inner.configure(config);
    }
    fn frame(&self, data: &[u8], keyframe: bool) {
        self.packets.fetch_add(1, Ordering::Relaxed);
        self.inner.frame(data, keyframe);
    }
}

#[test]
#[ignore = "needs a phone: set MASAYA_TEST_SERIAL"]
fn a_real_phone_streams_frames_and_follows_a_tap_and_a_swipe() {
    common::isolate();
    let Ok(serial) = std::env::var("MASAYA_TEST_SERIAL") else {
        panic!("set MASAYA_TEST_SERIAL to the phone's serial (adb get-serialno)");
    };
    let runtime = tokio::runtime::Runtime::new().expect("a runtime");
    // SAFETY: plain object creation; the layer is never shown.
    let layer = unsafe { AVSampleBufferDisplayLayer::new() };
    let sink = Arc::new(LayerSink::new(unsafe { layer.sampleBufferRenderer() }));
    let counting = Arc::new(Counting {
        inner: sink.clone(),
        packets: AtomicU64::new(0),
    });

    let report = runtime.block_on(async {
        let source = Arc::new(AdbSource::new(Locale::Es));
        let started = Instant::now();
        let mut session = source
            .start_mirror(serial)
            .await
            .expect("the mirror starts");
        let start_time = started.elapsed();
        let video = VideoSize {
            width: session.video.width,
            height: session.video.height,
        };
        let reader = session.take_video().expect("a video stream");

        let registry = Arc::new(Registry::default());
        registry.open("phone");
        registry.attach("phone", counting.clone() as Arc<dyn FrameSink>);
        let pump_registry = registry.clone();
        let pumping = tokio::spawn(async move { pump(reader, &pump_registry, "phone").await });

        tokio::time::sleep(SETTLE).await;
        let before = counting.packets.load(Ordering::Relaxed);

        // The input path the view uses: events → translator → one ordered channel → control.
        let (sender, messages) = tokio::sync::mpsc::unbounded_channel();
        let control = session.control();
        let sent = Arc::new(AtomicU64::new(0));
        let sent_count = sent.clone();
        let forwarding = tokio::spawn(forward_in_order(messages, move |message| {
            let (control, sent_count) = (control.clone(), sent_count.clone());
            async move {
                let ok = control.send(&message).await.is_ok();
                if ok {
                    sent_count.fetch_add(1, Ordering::Relaxed);
                }
                ok
            }
        }));
        // A view the size of the video, flipped: view points are phone pixels.
        let geometry = Geometry {
            view: ViewSize {
                width: f64::from(video.width),
                height: f64::from(video.height),
            },
            video,
            flipped: true,
        };
        let (w, h) = (f64::from(video.width), f64::from(video.height));
        let mut translator = InputTranslator::default();
        let mut send = |event: InputEvent| {
            for message in translator.translate(&event, geometry) {
                sender.send(message).expect("the input task runs");
            }
        };
        // A tap on the status bar, then a swipe down from the top (the notification shade).
        send(InputEvent::MouseDown { x: w / 2.0, y: 4.0 });
        send(InputEvent::MouseUp { x: w / 2.0, y: 4.0 });
        tokio::time::sleep(Duration::from_millis(300)).await;
        send(InputEvent::MouseDown { x: w / 2.0, y: 4.0 });
        for step in 1..=10 {
            let y = 4.0 + (h * 0.6 - 4.0) * f64::from(step) / 10.0;
            send(InputEvent::MouseDragged { x: w / 2.0, y });
            tokio::time::sleep(Duration::from_millis(16)).await;
        }
        send(InputEvent::MouseUp {
            x: w / 2.0,
            y: h * 0.6,
        });
        tokio::time::sleep(WATCH).await;
        let after = counting.packets.load(Ordering::Relaxed);
        // Close the shade again with Back (the right button).
        send(InputEvent::RightMouseDown);
        tokio::time::sleep(Duration::from_millis(500)).await;

        let server_exited = *session.exited().borrow();
        let still_pumping = !pumping.is_finished();
        drop(sender);
        let _ = forwarding.await;
        session.close();
        pumping.abort();
        (
            start_time,
            video,
            before,
            after,
            sent.load(Ordering::Relaxed),
            server_exited,
            still_pumping,
        )
    });

    let (start, video, before, after, sent, server_exited, still_pumping) = report;
    let stats = sink.stats();
    eprintln!(
        "start {start:?}, video {video:?}, packets before input {before}, after {after}, \
         input messages sent {sent}, {stats:?}"
    );
    assert!(stats.configurations >= 1, "the codec configuration arrived");
    assert!(
        stats.enqueued >= 1,
        "at least the first keyframe reached the renderer"
    );
    assert!(!sink.failed(), "the renderer decoded what it got");
    assert_eq!(stats.renderer_failures, 0);
    // tap (2) + swipe (1 down, 10 moves, 1 up) + back (2)
    assert_eq!(sent, 16, "every input message reached the control socket");
    assert!(
        !server_exited && still_pumping,
        "the session stayed alive through the input"
    );
    assert!(
        after > before,
        "the screen changed after the input: new frames arrived"
    );
}
