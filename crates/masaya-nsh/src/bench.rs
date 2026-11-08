//! The spike's scripted benchmark (`MASAYA_BENCH=<scenario>`): once the mirror shows, a thread
//! replays the same synthetic input the Electron measurement script sends over CDP, through the
//! real input path (an [`InputEvent`] → [`InputTranslator`] → the session's ordered channel →
//! `ControlHandle::send`), and logs what [`crate::metrics`] saw after each input (target
//! `masaya::bench`). Only the AppKit event dispatch to the view is skipped: nobody can click the
//! window from a script.
//!
//! Scenarios (positions are fractions of the video, so both apps touch the same phone pixels):
//! - `still`: no input for 30 s.
//! - `wheel`: 12 trials of 30 wheel notches, one every 33 ms, down then up.
//! - `drag`: 12 trials of a held finger moving 35 % of the height in 1.5 s at 125 moves a
//!   second, held still 200 ms, then lifted; up then down.
//!
//! Each trial starts on a still screen (no packet for 800 ms) and measures from its first input.

use std::time::{Duration, Instant};

use crate::input::events::{Geometry, InputEvent, InputTranslator};
use crate::input::mapping::{VideoSize, ViewSize};
use crate::metrics::{self, TrialResult};
use crate::mirror::sink;

pub const TARGET: &str = "masaya::bench";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Scenario {
    Still,
    Wheel,
    Drag,
}

impl Scenario {
    pub fn parse(name: &str) -> Option<Self> {
        match name.trim() {
            "still" => Some(Self::Still),
            "wheel" => Some(Self::Wheel),
            "drag" => Some(Self::Drag),
            _ => None,
        }
    }

    fn trials(self) -> usize {
        match self {
            Self::Still => 0,
            Self::Wheel | Self::Drag => TRIALS,
        }
    }

    /// The part of a trial the phone's frame rate is measured over: after the gesture started,
    /// while the input keeps coming.
    fn rate_window(self) -> (Duration, Duration) {
        match self {
            Self::Still => (Duration::ZERO, Duration::ZERO),
            Self::Wheel => (Duration::from_millis(200), WHEEL_STEP * (WHEEL_NOTCHES - 1)),
            Self::Drag => (Duration::from_millis(200), DRAG_MOVE * DRAG_MOVES),
        }
    }
}

pub const TRIALS: usize = 12;
pub const STILL_FOR: Duration = Duration::from_secs(30);
pub const WHEEL_NOTCHES: u32 = 30;
pub const WHEEL_STEP: Duration = Duration::from_millis(33);
/// 125 moves a second.
pub const DRAG_MOVE: Duration = Duration::from_millis(8);
pub const DRAG_MOVES: u32 = 187;
pub const DRAG_HOLD: Duration = Duration::from_millis(200);
/// No packet for this long: the screen is still.
pub const QUIET: Duration = Duration::from_millis(800);
const QUIET_TIMEOUT: Duration = Duration::from_secs(6);
/// How long a trial keeps watching after its last input.
const TAIL: Duration = Duration::from_millis(700);
/// The stream runs this long before the first trial.
const SETTLE: Duration = Duration::from_secs(3);

/// One input of a trial, `at` after its start.
#[derive(Debug, Clone, PartialEq)]
pub struct Step {
    pub at: Duration,
    pub event: InputEvent,
}

/// The inputs of trial `index` on a video of `width`×`height`, in view points of a flipped view
/// the size of the video (so a point is a phone pixel).
pub fn trial_steps(scenario: Scenario, index: usize, width: u32, height: u32) -> Vec<Step> {
    let (w, h) = (f64::from(width), f64::from(height));
    let down = index.is_multiple_of(2);
    match scenario {
        Scenario::Still => Vec::new(),
        Scenario::Wheel => {
            // NSEvent's precise deltas: -100 points is one notch down (the Electron script's
            // CDP `deltaY: 100`).
            let delta_y = if down { -100.0 } else { 100.0 };
            (0..WHEEL_NOTCHES)
                .map(|notch| Step {
                    at: WHEEL_STEP * notch,
                    event: InputEvent::Scroll {
                        x: w * 0.5,
                        y: h * 0.6,
                        delta_x: 0.0,
                        delta_y,
                        precise: true,
                    },
                })
                .collect()
        }
        Scenario::Drag => {
            let (from, to) = if down { (0.70, 0.35) } else { (0.35, 0.70) };
            let x = w * 0.5;
            let mut steps = vec![Step {
                at: Duration::ZERO,
                event: InputEvent::MouseDown { x, y: h * from },
            }];
            for step in 1..=DRAG_MOVES {
                let progress = f64::from(step) / f64::from(DRAG_MOVES);
                steps.push(Step {
                    at: DRAG_MOVE * step,
                    event: InputEvent::MouseDragged {
                        x,
                        y: h * (from + (to - from) * progress),
                    },
                });
            }
            steps.push(Step {
                at: DRAG_MOVE * DRAG_MOVES + DRAG_HOLD,
                event: InputEvent::MouseUp { x, y: h * to },
            });
            steps
        }
    }
}

/// Events per second between `from` and `to` (times since the trial's start).
pub fn rate(times: &[Duration], from: Duration, to: Duration) -> f64 {
    let span = to.saturating_sub(from).as_secs_f64();
    if span <= 0.0 {
        return 0.0;
    }
    times.iter().filter(|t| **t >= from && **t < to).count() as f64 / span
}

/// Display refreshes (16.7 ms slots from the trial's start) per second that got a new frame.
pub fn visible_rate(presents: &[Duration], from: Duration, to: Duration) -> f64 {
    let span = to.saturating_sub(from).as_secs_f64();
    if span <= 0.0 {
        return 0.0;
    }
    let mut slots: Vec<u128> = presents
        .iter()
        .filter(|t| **t >= from && **t < to)
        .map(|t| t.as_micros() / 16_667)
        .collect();
    slots.dedup();
    slots.len() as f64 / span
}

/// `n`, p50, p95, mean, min and max of millisecond samples.
pub fn summary(samples: &[f64]) -> Option<String> {
    if samples.is_empty() {
        return None;
    }
    let mut micros: Vec<u64> = samples.iter().map(|ms| (ms * 1000.0) as u64).collect();
    let (p50, p95) = metrics::p50_p95(&mut micros)?;
    let mean = samples.iter().sum::<f64>() / samples.len() as f64;
    Some(format!(
        "n={} p50={:.1} p95={:.1} mean={:.1} min={:.1} max={:.1}",
        samples.len(),
        p50 as f64 / 1000.0,
        p95 as f64 / 1000.0,
        mean,
        micros[0] as f64 / 1000.0,
        micros[micros.len() - 1] as f64 / 1000.0,
    ))
}

fn ms(duration: Option<Duration>) -> Option<f64> {
    duration.map(|d| d.as_secs_f64() * 1000.0)
}

fn show(value: Option<f64>) -> String {
    value.map_or_else(|| "-".to_owned(), |value| format!("{value:.1}"))
}

/// Starts the benchmark the environment asks for, if any, on the mirror of `key`.
pub fn start_from_env(key: &str, width: u32, height: u32) {
    let Some(name) = metrics::env_value(metrics::BENCH_ENV) else {
        return;
    };
    let Some(scenario) = Scenario::parse(&name) else {
        log::warn!(target: TARGET, "unknown scenario {name:?} (still, wheel, drag)");
        return;
    };
    let key = key.to_owned();
    let spawned = std::thread::Builder::new()
        .name("masaya-bench".to_owned())
        .spawn(move || run(scenario, &key, width, height));
    if let Err(error) = spawned {
        log::warn!(target: TARGET, "bench did not start: {error}");
    }
}

fn wait_for_quiet() -> bool {
    let started = Instant::now();
    while started.elapsed() < QUIET_TIMEOUT {
        if metrics::since_last_packet().is_some_and(|since| since >= QUIET) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(5));
    }
    false
}

fn sleep_until(deadline: Instant) {
    let now = Instant::now();
    if deadline > now {
        std::thread::sleep(deadline - now);
    }
}

fn run(scenario: Scenario, key: &str, width: u32, height: u32) {
    // The stream is running and has settled.
    while metrics::since_last_packet().is_none() {
        std::thread::sleep(Duration::from_millis(50));
    }
    std::thread::sleep(SETTLE);
    log::info!(target: TARGET, "start scenario={scenario:?} video={width}x{height}");
    if scenario == Scenario::Still {
        std::thread::sleep(STILL_FOR);
        log::info!(target: TARGET, "done scenario={scenario:?}");
        return;
    }
    let Some(input) = sink::registry().input(key) else {
        log::warn!(target: TARGET, "the session takes no input");
        return;
    };
    let geometry = Geometry {
        view: ViewSize {
            width: f64::from(width),
            height: f64::from(height),
        },
        video: VideoSize { width, height },
        flipped: true,
    };
    let (from, to) = scenario.rate_window();
    let mut translator = InputTranslator::default();
    let (mut to_packet, mut to_present, mut fps, mut visible) =
        (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    for index in 0..scenario.trials() {
        let quiet = wait_for_quiet();
        let steps = trial_steps(scenario, index, width, height);
        let started = metrics::begin_trial();
        for step in &steps {
            sleep_until(started + step.at);
            let messages = translator.translate(&step.event, geometry);
            if !messages.is_empty() && input.send(messages).is_err() {
                log::warn!(target: TARGET, "the session ended");
                return;
            }
        }
        let last = steps.last().map_or(Duration::ZERO, |step| step.at);
        sleep_until(started + last + TAIL);
        let TrialResult {
            to_packet: packet,
            to_present: present,
            packets,
            presents,
        } = metrics::end_trial();
        let (phone_fps, visible_fps) =
            (rate(&packets, from, to), visible_rate(&presents, from, to));
        log::info!(
            target: TARGET,
            "trial scenario={scenario:?} index={index} quiet={quiet} to_packet_ms={} \
             to_present_ms={} phone_fps={phone_fps:.1} visible_fps={visible_fps:.1}",
            show(ms(packet)),
            show(ms(present)),
        );
        // A trial that did not start still measures nothing about latency.
        if quiet {
            to_packet.extend(ms(packet));
            to_present.extend(ms(present));
        }
        fps.push(phone_fps);
        visible.push(visible_fps);
    }
    let mean = |values: &[f64]| values.iter().sum::<f64>() / values.len().max(1) as f64;
    log::info!(
        target: TARGET,
        "summary scenario={scenario:?} to_packet_ms[{}] to_present_ms[{}] phone_fps_mean={:.1} \
         visible_fps_mean={:.1}",
        summary(&to_packet).unwrap_or_default(),
        summary(&to_present).unwrap_or_default(),
        mean(&fps),
        mean(&visible),
    );
    log::info!(target: TARGET, "done scenario={scenario:?}");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scenarios_parse_by_name() {
        assert_eq!(Scenario::parse("drag"), Some(Scenario::Drag));
        assert_eq!(Scenario::parse(" wheel "), Some(Scenario::Wheel));
        assert_eq!(Scenario::parse("still"), Some(Scenario::Still));
        assert_eq!(Scenario::parse("fling"), None);
    }

    #[test]
    fn a_drag_presses_moves_at_125_a_second_holds_and_lifts() {
        let steps = trial_steps(Scenario::Drag, 0, 896, 1920);
        assert_eq!(steps.len(), DRAG_MOVES as usize + 2);
        assert_eq!(
            steps[0].event,
            InputEvent::MouseDown {
                x: 448.0,
                y: 1920.0 * 0.70
            }
        );
        assert_eq!(steps[1].at, Duration::from_millis(8));
        let moves = steps
            .iter()
            .filter(|step| matches!(step.event, InputEvent::MouseDragged { .. }))
            .count();
        let span = steps[DRAG_MOVES as usize].at.as_secs_f64();
        assert!((moves as f64 / span - 125.0).abs() < 0.5);
        let last = steps.last().unwrap();
        assert_eq!(last.at, Duration::from_millis(8 * 187 + 200));
        assert!(
            matches!(last.event, InputEvent::MouseUp { y, .. } if (y - 1920.0 * 0.35).abs() < 1e-9)
        );
        // The next trial goes back down.
        let back = trial_steps(Scenario::Drag, 1, 896, 1920);
        assert!(
            matches!(back[0].event, InputEvent::MouseDown { y, .. } if (y - 1920.0 * 0.35).abs() < 1e-9)
        );
    }

    #[test]
    fn a_wheel_trial_scrolls_one_way_then_the_other() {
        let down = trial_steps(Scenario::Wheel, 0, 896, 1920);
        assert_eq!(down.len(), 30);
        assert_eq!(down[29].at, Duration::from_millis(33 * 29));
        assert!(
            matches!(down[0].event, InputEvent::Scroll { delta_y, precise: true, .. } if delta_y < 0.0)
        );
        let up = trial_steps(Scenario::Wheel, 1, 896, 1920);
        assert!(matches!(up[0].event, InputEvent::Scroll { delta_y, .. } if delta_y > 0.0));
        assert!(trial_steps(Scenario::Still, 0, 896, 1920).is_empty());
    }

    #[test]
    fn rates_count_inside_the_window_only() {
        let ms = Duration::from_millis;
        let times = [ms(100), ms(250), ms(500), ms(999), ms(1000)];
        assert!((rate(&times, ms(200), ms(1000)) - 3.0 / 0.8).abs() < 1e-9);
        assert_eq!(rate(&times, ms(10), ms(10)), 0.0);
        // Two frames in one refresh show as one.
        // 16.7 ms slots from the start: 205 and 210 ms share slot 12.
        let presents = [ms(205), ms(210), ms(220), ms(240)];
        assert!((visible_rate(&presents, ms(200), ms(300)) - 3.0 / 0.1).abs() < 1e-9);
    }

    #[test]
    fn summaries_report_percentiles_and_extremes() {
        assert_eq!(summary(&[]), None);
        assert_eq!(
            summary(&[30.0, 10.0, 20.0]).unwrap(),
            "n=3 p50=20.0 p95=30.0 mean=20.0 min=10.0 max=30.0"
        );
    }
}
