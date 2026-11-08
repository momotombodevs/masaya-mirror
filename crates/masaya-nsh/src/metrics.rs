//! Opt-in measurements for the NSH spike's benchmark. Nothing here runs unless the process starts
//! with `MASAYA_METRICS=1` (or `MASAYA_BENCH`, which needs them): every hook checks
//! [`enabled`] first, a relaxed load, and returns.
//!
//! With metrics on, a thread logs once a second (target `masaya::metrics`): packets per second,
//! the p50/p95 time from a packet arriving off the socket to its sample buffer being enqueued,
//! frames the layer presented, pointer moves the core dropped and renderer failures.
//!
//! "Presented" is when the display layer's renderer starts showing a new pixel buffer
//! (`copyDisplayedPixelBuffer` changes, polled every millisecond by the view). That is the
//! closest point to the screen AppKit exposes: the compositor and the display add their own
//! time after it, as they do after Chromium's `transferFromImageBitmap` in the Electron app.
//!
//! Times come from [`Instant`], which on macOS reads the same clock as `mach_absolute_time`.
//!
//! The measurements assume one mirror, as the benchmark runs: with several windows open, packets
//! and presents add up across them, and the dropped-moves and renderer-failure counters are
//! those of the window that set them last (each window clears only its own, see [`Owned`]).

use std::sync::atomic::{AtomicBool, AtomicU8, AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant};

/// `1` turns the measurements on.
pub const METRICS_ENV: &str = "MASAYA_METRICS";
/// A serial: the window opens that phone's mirror at launch instead of the list.
pub const AUTO_OPEN_ENV: &str = "MASAYA_AUTO_OPEN";
/// A scenario for [`crate::bench`] to drive once the mirror shows. Turns metrics on.
pub const BENCH_ENV: &str = "MASAYA_BENCH";

/// The log target of the per-second line.
pub const TARGET: &str = "masaya::metrics";

/// The `p`-th percentile (0–100) of `sorted` by nearest rank, `None` when empty. `sorted` must be
/// in ascending order.
pub fn percentile(sorted: &[u64], p: f64) -> Option<u64> {
    if sorted.is_empty() || !p.is_finite() {
        return None;
    }
    let p = p.clamp(0.0, 100.0);
    let rank = ((p / 100.0) * sorted.len() as f64).ceil() as usize;
    Some(sorted[rank.clamp(1, sorted.len()) - 1])
}

/// p50 and p95 of `samples` (sorted in place).
pub fn p50_p95(samples: &mut [u64]) -> Option<(u64, u64)> {
    samples.sort_unstable();
    Some((percentile(samples, 50.0)?, percentile(samples, 95.0)?))
}

/// Whether `value` (an environment variable) asks for something: set, not empty, not `0`.
pub fn is_on(value: Option<&str>) -> bool {
    value.is_some_and(|value| !value.trim().is_empty() && value.trim() != "0")
}

/// The value of `name`, trimmed, when it is set and not empty.
pub fn env_value(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

const UNKNOWN: u8 = 0;
const OFF: u8 = 1;
const ON: u8 = 2;
static ENABLED: AtomicU8 = AtomicU8::new(UNKNOWN);

/// Whether the process measures. Read from the environment once.
pub fn enabled() -> bool {
    match ENABLED.load(Ordering::Relaxed) {
        ON => true,
        OFF => false,
        _ => {
            let on =
                is_on(std::env::var(METRICS_ENV).ok().as_deref()) || env_value(BENCH_ENV).is_some();
            ENABLED.store(if on { ON } else { OFF }, Ordering::Relaxed);
            if on {
                start_logger();
            }
            on
        }
    }
}

/// A counter the screen or the view owns, read by the per-second line.
type Counter = Box<dyn Fn() -> u64 + Send>;

/// What one benchmark trial saw after its input.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct TrialResult {
    /// Input to the first video packet enqueued after it.
    pub to_packet: Option<Duration>,
    /// Input to the first new frame the layer presented after it.
    pub to_present: Option<Duration>,
    /// Video packets enqueued in the trial, by time since the input.
    pub packets: Vec<Duration>,
    /// Frames presented in the trial, by time since the input.
    pub presents: Vec<Duration>,
}

struct Trial {
    started: Instant,
    result: TrialResult,
}

#[derive(Default)]
struct State {
    window_started: Option<Instant>,
    packets: u64,
    presents: u64,
    /// Display refreshes (16.7 ms slots) that got at least one new frame.
    visible: u64,
    last_visible_slot: Option<u64>,
    enqueue_us: Vec<u64>,
    last_packet: Option<Instant>,
    trial: Option<Trial>,
    dropped_moves: Owned,
    renderer_failures: Owned,
}

/// A counter and who set it: only that owner clears it, so a window that closes never clears
/// the counter of another that set its own since.
#[derive(Default)]
pub struct Owned(Option<(u64, Counter)>);

impl Owned {
    pub fn set(&mut self, owner: u64, counter: Counter) {
        self.0 = Some((owner, counter));
    }

    /// Clears the counter if `owner` set it; whether it did.
    pub fn clear(&mut self, owner: u64) -> bool {
        if self
            .0
            .as_ref()
            .is_some_and(|(current, _)| *current == owner)
        {
            self.0 = None;
            return true;
        }
        false
    }

    pub fn read(&self) -> Option<u64> {
        self.0.as_ref().map(|(_, count)| count())
    }
}

/// A token no other owner of a counter has.
pub fn new_owner() -> u64 {
    static NEXT: AtomicU64 = AtomicU64::new(1);
    NEXT.fetch_add(1, Ordering::Relaxed)
}

/// A 60 Hz refresh, the display the measurements ran on.
const REFRESH: Duration = Duration::from_micros(16_667);

fn state() -> MutexGuard<'static, State> {
    static STATE: OnceLock<Mutex<State>> = OnceLock::new();
    STATE
        .get_or_init(Mutex::default)
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn epoch() -> Instant {
    static EPOCH: OnceLock<Instant> = OnceLock::new();
    *EPOCH.get_or_init(Instant::now)
}

/// A video packet arrived off the socket at `arrived` and was handed to the layer (enqueued or
/// dropped) by `done`.
pub fn packet(arrived: Instant, done: Instant) {
    if !enabled() {
        return;
    }
    let mut state = state();
    state.packets += 1;
    state
        .enqueue_us
        .push(done.saturating_duration_since(arrived).as_micros() as u64);
    state.last_packet = Some(done);
    if let Some(trial) = state.trial.as_mut()
        && done >= trial.started
    {
        let since = done - trial.started;
        trial.result.to_packet.get_or_insert(since);
        trial.result.packets.push(since);
    }
}

/// The layer started showing a new frame at `at`.
pub fn presented(at: Instant) {
    if !enabled() {
        return;
    }
    let mut state = state();
    state.presents += 1;
    let slot = (at.saturating_duration_since(epoch()).as_micros() / REFRESH.as_micros()) as u64;
    if state.last_visible_slot != Some(slot) {
        state.last_visible_slot = Some(slot);
        state.visible += 1;
    }
    if let Some(trial) = state.trial.as_mut()
        && at >= trial.started
    {
        let since = at - trial.started;
        // Only a frame decoded from a packet that came after the input counts.
        if trial.result.to_packet.is_some() {
            trial.result.to_present.get_or_insert(since);
        }
        trial.result.presents.push(since);
    }
}

/// Starts a trial now: what follows is attributed to the input sent right after.
pub fn begin_trial() -> Instant {
    let started = Instant::now();
    if enabled() {
        state().trial = Some(Trial {
            started,
            result: TrialResult::default(),
        });
    }
    started
}

/// Ends the trial, answering what it saw.
pub fn end_trial() -> TrialResult {
    state()
        .trial
        .take()
        .map(|trial| trial.result)
        .unwrap_or_default()
}

/// How long since the last video packet, `None` before the first.
pub fn since_last_packet() -> Option<Duration> {
    state().last_packet.map(|last| last.elapsed())
}

/// The core's count of dropped pointer moves, for the per-second line, set by `owner`
/// ([`new_owner`]).
pub fn set_dropped_moves(owner: u64, counter: Counter) {
    if enabled() {
        state().dropped_moves.set(owner, counter);
    }
}

/// Stops reading the dropped moves, if `owner` set the counter that is read.
pub fn clear_dropped_moves(owner: u64) {
    if enabled() {
        state().dropped_moves.clear(owner);
    }
}

/// The view's count of renderer failures, for the per-second line, set by `owner`.
pub fn set_renderer_failures(owner: u64, counter: Counter) {
    if enabled() {
        state().renderer_failures.set(owner, counter);
    }
}

/// Stops reading the renderer failures, if `owner` set the counter that is read.
pub fn clear_renderer_failures(owner: u64) {
    if enabled() {
        state().renderer_failures.clear(owner);
    }
}

/// One second's numbers, as logged.
#[derive(Debug, Clone, PartialEq)]
pub struct Second {
    pub packets_per_s: f64,
    pub presented_per_s: f64,
    pub visible_per_s: f64,
    pub enqueue_p50_us: Option<u64>,
    pub enqueue_p95_us: Option<u64>,
    pub dropped_moves: Option<u64>,
    pub renderer_failures: Option<u64>,
}

/// Takes the numbers since the last call and starts a new window.
fn take_second(now: Instant) -> Second {
    let mut state = state();
    let elapsed = state
        .window_started
        .replace(now)
        .map_or(1.0, |started| now.duration_since(started).as_secs_f64())
        .max(1e-3);
    let mut samples = std::mem::take(&mut state.enqueue_us);
    let p = p50_p95(&mut samples);
    let second = Second {
        packets_per_s: state.packets as f64 / elapsed,
        presented_per_s: state.presents as f64 / elapsed,
        visible_per_s: state.visible as f64 / elapsed,
        enqueue_p50_us: p.map(|(p50, _)| p50),
        enqueue_p95_us: p.map(|(_, p95)| p95),
        dropped_moves: state.dropped_moves.read(),
        renderer_failures: state.renderer_failures.read(),
    };
    state.packets = 0;
    state.presents = 0;
    state.visible = 0;
    second
}

fn show(value: Option<u64>) -> String {
    value.map_or_else(|| "-".to_owned(), |value| value.to_string())
}

/// The per-second line.
pub fn format_second(second: &Second) -> String {
    format!(
        "packets/s={:.1} presented/s={:.1} visible/s={:.1} enqueue_us p50={} p95={} \
         dropped_moves={} renderer_failures={}",
        second.packets_per_s,
        second.presented_per_s,
        second.visible_per_s,
        show(second.enqueue_p50_us),
        show(second.enqueue_p95_us),
        show(second.dropped_moves),
        show(second.renderer_failures),
    )
}

fn start_logger() {
    static STARTED: AtomicBool = AtomicBool::new(false);
    if STARTED.swap(true, Ordering::Relaxed) {
        return;
    }
    epoch();
    let spawned = std::thread::Builder::new()
        .name("masaya-metrics".to_owned())
        .spawn(|| {
            take_second(Instant::now());
            loop {
                std::thread::sleep(Duration::from_secs(1));
                log::info!(target: TARGET, "{}", format_second(&take_second(Instant::now())));
            }
        });
    if let Err(error) = spawned {
        log::warn!(target: TARGET, "metrics logger did not start: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percentiles_by_nearest_rank() {
        let sorted: Vec<u64> = (1..=100).collect();
        assert_eq!(percentile(&sorted, 50.0), Some(50));
        assert_eq!(percentile(&sorted, 95.0), Some(95));
        assert_eq!(percentile(&sorted, 100.0), Some(100));
        assert_eq!(percentile(&sorted, 0.0), Some(1));
        assert_eq!(percentile(&[7], 95.0), Some(7));
        assert_eq!(percentile(&[1, 2, 3], 50.0), Some(2));
        assert_eq!(percentile(&[10, 20, 30, 40], 50.0), Some(20));
        assert_eq!(percentile(&[10, 20, 30, 40], 95.0), Some(40));
    }

    #[test]
    fn percentiles_of_nothing_or_nonsense_are_none_or_clamped() {
        assert_eq!(percentile(&[], 50.0), None);
        assert_eq!(percentile(&[1, 2], f64::NAN), None);
        assert_eq!(percentile(&[1, 2], 250.0), Some(2));
        assert_eq!(percentile(&[1, 2], -3.0), Some(1));
    }

    #[test]
    fn p50_p95_sorts_first() {
        let mut samples = vec![9, 1, 5, 3, 7];
        assert_eq!(p50_p95(&mut samples), Some((5, 9)));
        assert_eq!(p50_p95(&mut []), None);
    }

    #[test]
    fn only_set_non_zero_values_turn_things_on() {
        assert!(is_on(Some("1")));
        assert!(is_on(Some("yes")));
        assert!(!is_on(Some("0")));
        assert!(!is_on(Some(" ")));
        assert!(!is_on(None));
    }

    #[test]
    fn the_line_shows_missing_counters_as_dashes() {
        let line = format_second(&Second {
            packets_per_s: 118.0,
            presented_per_s: 60.04,
            visible_per_s: 59.0,
            enqueue_p50_us: Some(210),
            enqueue_p95_us: None,
            dropped_moves: Some(0),
            renderer_failures: None,
        });
        assert_eq!(
            line,
            "packets/s=118.0 presented/s=60.0 visible/s=59.0 enqueue_us p50=210 p95=- \
             dropped_moves=0 renderer_failures=-"
        );
    }

    #[test]
    fn only_the_owner_of_a_counter_clears_it() {
        let mut counter = Owned::default();
        assert_eq!(counter.read(), None);
        let (first, second) = (new_owner(), new_owner());
        assert_ne!(first, second);
        counter.set(first, Box::new(|| 1));
        // A second window sets its own: the first one closing leaves it.
        counter.set(second, Box::new(|| 2));
        assert!(!counter.clear(first));
        assert_eq!(counter.read(), Some(2));
        assert!(counter.clear(second));
        assert_eq!(counter.read(), None);
    }
}
