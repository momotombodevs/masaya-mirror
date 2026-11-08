//! Bringing the mirror back after a drop the user did not ask for (cable pulled, phone
//! restarted, server killed). Ports `useReconnect.ts` as plain state with the clock handed in:
//! the screen runs the waits and the attempts, and reports how each went.
//!
//! The budget of attempts is kept across drops that come soon after a reconnect, so a stream
//! that dies as it starts cannot loop forever; a connection that stayed up for
//! [`STABLE_AFTER`] earns a fresh budget.

use std::time::{Duration, Instant};

/// The wait before each attempt; its length is the budget (12 attempts, about a minute).
pub const RECONNECT_DELAYS: [Duration; 12] = [
    Duration::from_secs(1),
    Duration::from_secs(2),
    Duration::from_secs(3),
    Duration::from_secs(5),
    Duration::from_secs(5),
    Duration::from_secs(5),
    Duration::from_secs(5),
    Duration::from_secs(5),
    Duration::from_secs(5),
    Duration::from_secs(5),
    Duration::from_secs(5),
    Duration::from_secs(5),
];

/// A reconnect that drops again sooner than this keeps spending the same budget.
pub const STABLE_AFTER: Duration = Duration::from_secs(10);

/// What the screen does next.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Next {
    /// Wait `delay`, then try to open the mirror again; report the result with `run`.
    Attempt {
        attempt: usize,
        delay: Duration,
        run: u64,
    },
    /// The budget ran out: say so, and offer to try again or close.
    GaveUp,
    /// A retry cycle is already running (the same drop reported twice): nothing.
    AlreadyRunning,
}

/// Where the reconnect stands, for the screen.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReconnectState {
    Idle,
    Reconnecting { attempt: usize },
    Failed,
}

#[derive(Debug, Clone)]
pub struct Reconnect {
    delays: Vec<Duration>,
    stable_after: Duration,
    /// Attempts spent from the budget.
    used: usize,
    last_success: Option<Instant>,
    /// Bumped by every begin and cancel: a report of an older cycle changes nothing.
    run: u64,
    state: ReconnectState,
}

impl Default for Reconnect {
    fn default() -> Self {
        Self::new(RECONNECT_DELAYS.to_vec(), STABLE_AFTER)
    }
}

impl Reconnect {
    /// `delays` must not be empty.
    pub fn new(delays: Vec<Duration>, stable_after: Duration) -> Self {
        assert!(!delays.is_empty(), "a reconnect needs at least one attempt");
        Self {
            delays,
            stable_after,
            used: 0,
            last_success: None,
            run: 0,
            state: ReconnectState::Idle,
        }
    }

    pub fn max_attempts(&self) -> usize {
        self.delays.len()
    }

    pub fn state(&self) -> ReconnectState {
        self.state
    }

    /// The stream ended without the user asking for it (or the user pressed Try again after it
    /// gave up).
    pub fn begin(&mut self, now: Instant) -> Next {
        if matches!(self.state, ReconnectState::Reconnecting { .. }) {
            return Next::AlreadyRunning;
        }
        self.run = self.run.wrapping_add(1);
        let stable = self
            .last_success
            .is_none_or(|success| now.saturating_duration_since(success) >= self.stable_after);
        if stable {
            self.used = 0;
        }
        self.next_attempt()
    }

    /// The attempt of `run` could not open the mirror: the next one, or give up. `None` for a
    /// report of a cycle that was cancelled or begun again since.
    pub fn failed(&mut self, run: u64) -> Option<Next> {
        (run == self.run && matches!(self.state, ReconnectState::Reconnecting { .. }))
            .then(|| self.next_attempt())
    }

    /// The attempt of `run` brought the stream back. Whether it was the current cycle's.
    pub fn succeeded(&mut self, run: u64, now: Instant) -> bool {
        if run != self.run || !matches!(self.state, ReconnectState::Reconnecting { .. }) {
            return false;
        }
        self.last_success = Some(now);
        self.state = ReconnectState::Idle;
        true
    }

    /// Whether `run` is the cycle running now: an attempt whose wait ended checks before it
    /// opens anything.
    pub fn is_current(&self, run: u64) -> bool {
        run == self.run && matches!(self.state, ReconnectState::Reconnecting { .. })
    }

    /// Stops retrying (the user closed the window, or started over by hand).
    pub fn cancel(&mut self) {
        self.run = self.run.wrapping_add(1);
        self.state = ReconnectState::Idle;
    }

    fn next_attempt(&mut self) -> Next {
        if self.used >= self.delays.len() {
            self.state = ReconnectState::Failed;
            return Next::GaveUp;
        }
        self.used += 1;
        let attempt = self.used;
        self.state = ReconnectState::Reconnecting { attempt };
        Next::Attempt {
            attempt,
            delay: self.delays[attempt - 1],
            run: self.run,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MS: fn(u64) -> Duration = Duration::from_millis;

    fn reconnect() -> Reconnect {
        Reconnect::new(vec![MS(100), MS(200), MS(300)], MS(10_000))
    }

    fn attempt(next: Next) -> (usize, Duration, u64) {
        match next {
            Next::Attempt {
                attempt,
                delay,
                run,
            } => (attempt, delay, run),
            other => panic!("expected an attempt, got {other:?}"),
        }
    }

    #[test]
    fn the_app_waits_one_two_three_then_five_seconds_twelve_times() {
        let reconnect = Reconnect::default();
        assert_eq!(reconnect.max_attempts(), 12);
        assert_eq!(RECONNECT_DELAYS[..4], [1, 2, 3, 5].map(Duration::from_secs));
        assert!(
            RECONNECT_DELAYS[4..]
                .iter()
                .all(|delay| *delay == Duration::from_secs(5))
        );
        assert_eq!(STABLE_AFTER, Duration::from_secs(10));
    }

    #[test]
    fn starts_idle_and_does_nothing_until_a_drop_is_reported() {
        assert_eq!(reconnect().state(), ReconnectState::Idle);
    }

    #[test]
    fn retries_with_growing_waits_until_the_mirror_opens() {
        let mut reconnect = reconnect();
        let now = Instant::now();
        let (n, delay, run) = attempt(reconnect.begin(now));
        assert_eq!((n, delay), (1, MS(100)));
        assert_eq!(
            reconnect.state(),
            ReconnectState::Reconnecting { attempt: 1 }
        );
        let (n, delay, _) = attempt(reconnect.failed(run).unwrap());
        assert_eq!((n, delay), (2, MS(200)));
        let (n, delay, _) = attempt(reconnect.failed(run).unwrap());
        assert_eq!((n, delay), (3, MS(300)));
        assert!(reconnect.succeeded(run, now));
        assert_eq!(reconnect.state(), ReconnectState::Idle);
    }

    #[test]
    fn gives_up_when_the_attempts_run_out() {
        let mut reconnect = reconnect();
        let (_, _, run) = attempt(reconnect.begin(Instant::now()));
        reconnect.failed(run);
        reconnect.failed(run);
        assert_eq!(reconnect.failed(run), Some(Next::GaveUp));
        assert_eq!(reconnect.state(), ReconnectState::Failed);
        // Nothing more to report for that cycle.
        assert_eq!(reconnect.failed(run), None);
    }

    #[test]
    fn can_start_over_after_giving_up() {
        let mut reconnect = reconnect();
        let now = Instant::now();
        let (_, _, run) = attempt(reconnect.begin(now));
        for _ in 0..3 {
            reconnect.failed(run);
        }
        let (n, _, run) = attempt(reconnect.begin(now));
        assert_eq!(n, 1);
        assert!(reconnect.succeeded(run, now));
        assert_eq!(reconnect.state(), ReconnectState::Idle);
    }

    #[test]
    fn stops_retrying_once_cancelled() {
        let mut reconnect = reconnect();
        let now = Instant::now();
        let (_, _, run) = attempt(reconnect.begin(now));
        assert!(reconnect.is_current(run));
        reconnect.cancel();
        assert!(!reconnect.is_current(run));
        assert_eq!(reconnect.state(), ReconnectState::Idle);
        // The attempt that was waiting reports late: it starts nothing.
        assert_eq!(reconnect.failed(run), None);
        assert!(!reconnect.succeeded(run, now));
    }

    #[test]
    fn keeps_spending_the_same_budget_when_a_reconnect_drops_right_away() {
        let mut reconnect = reconnect();
        let start = Instant::now();
        for drop in 0..3 {
            let now = start + MS(1_000 * drop);
            let (n, _, run) = attempt(reconnect.begin(now));
            assert_eq!(n as u64, drop + 1);
            assert!(reconnect.succeeded(run, now));
        }
        assert_eq!(reconnect.begin(start + MS(3_000)), Next::GaveUp);
        assert_eq!(reconnect.state(), ReconnectState::Failed);
    }

    #[test]
    fn refills_the_budget_after_a_stable_connection() {
        let mut reconnect = Reconnect::new(vec![MS(100), MS(200), MS(300)], MS(5_000));
        let start = Instant::now();
        let (_, _, run) = attempt(reconnect.begin(start));
        reconnect.failed(run);
        assert!(reconnect.succeeded(run, start + MS(1_000)));
        let (n, _, _) = attempt(reconnect.begin(start + MS(7_000)));
        assert_eq!(n, 1);
    }

    #[test]
    fn ignores_a_second_report_of_the_same_drop_while_retrying() {
        let mut reconnect = reconnect();
        let now = Instant::now();
        let (_, _, run) = attempt(reconnect.begin(now));
        assert_eq!(reconnect.begin(now), Next::AlreadyRunning);
        let (n, _, _) = attempt(reconnect.failed(run).unwrap());
        assert_eq!(n, 2);
    }

    #[test]
    fn accepts_a_new_drop_once_the_stream_is_back() {
        let mut reconnect = reconnect();
        let now = Instant::now();
        let (_, _, run) = attempt(reconnect.begin(now));
        assert!(reconnect.succeeded(run, now));
        let (n, _, second) = attempt(reconnect.begin(now + MS(100)));
        assert_eq!(n, 2);
        assert_ne!(run, second);
    }
}
