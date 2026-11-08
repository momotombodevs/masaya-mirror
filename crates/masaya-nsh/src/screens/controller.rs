//! What a mirror screen does over its life, apart from how it looks: open the session, feed the
//! view once it attaches, and bring the stream back when it drops without the user asking
//! ([`Reconnect`]). Generic over the [`Session`], so a scripted session drives it in tests.
//!
//! Every task is started under the screen's owner, so closing the window cancels it; and every
//! task checks, after each await, that the session it was started for is still the current one
//! ([`Running::generation`]): a late result never stops, replaces or drops a newer session.

use std::cell::RefCell;
use std::future::Future;
use std::pin::Pin;
use std::rc::Rc;
use std::time::Instant;

use masaya_core::scrcpy::ScrcpySession;
use nsh_core::prelude::*;
use tokio::sync::mpsc::UnboundedReceiver;
use tokio::task::AbortHandle;

use crate::copy;
use crate::i18n::{Key, t};
use crate::mirror::control::{self, InputBatch};
use crate::mirror::{pump, sink};
use crate::reconnect::{Next, Reconnect};
use crate::state::MirrorView;
use crate::{bench, metrics};

/// How long the native view may take to attach before the screen gives up on it.
pub const ATTACH_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);

/// How a stream ends: `None` when the phone closed it cleanly, else why it broke.
pub type StreamFuture = Pin<Box<dyn Future<Output = Option<String>> + Send>>;

/// A mirror session: scrcpy's, or a scripted one in tests.
pub trait Session: Send + 'static {
    /// The video's size when the session opened.
    fn video_size(&self) -> (u32, u32);
    /// Starts the task that sends `batches` to the phone, in order. Called on an engine task.
    fn forward_input(&self, batches: UnboundedReceiver<InputBatch>) -> AbortHandle;
    /// The dropped-moves counter of the metrics, if it has one.
    fn dropped_moves(&self) -> Option<Box<dyn Fn() -> u64 + Send>> {
        None
    }
    /// The video's pump: hands each packet to the view of `key` until the stream ends. Once.
    fn take_stream(&mut self, key: String) -> Option<StreamFuture>;
    /// Closes the sockets, which stops the server on the phone.
    fn close(self);
}

impl Session for ScrcpySession {
    fn video_size(&self) -> (u32, u32) {
        (self.video.width, self.video.height)
    }

    fn forward_input(&self, batches: UnboundedReceiver<InputBatch>) -> AbortHandle {
        let control_handle = self.control();
        background(control::forward_in_order(batches, move |message| {
            let control_handle = control_handle.clone();
            async move {
                match control_handle.send(&message).await {
                    Ok(_) => true,
                    Err(error) => {
                        log::warn!("mirror: input stopped: {error}");
                        false
                    }
                }
            }
        }))
        .abort_handle()
    }

    fn dropped_moves(&self) -> Option<Box<dyn Fn() -> u64 + Send>> {
        let control_handle = self.control();
        Some(Box::new(move || control_handle.dropped_moves()))
    }

    fn take_stream(&mut self, key: String) -> Option<StreamFuture> {
        let reader = self.take_video()?;
        Some(Box::pin(async move {
            pump::pump(reader, sink::registry(), &key).await
        }))
    }

    fn close(self) {
        ScrcpySession::close(self);
    }
}

/// Opens a session for a phone's serial.
pub type OpenFuture<S> = Pin<Box<dyn Future<Output = Result<S, String>> + Send>>;
pub type Opener<S> = Rc<dyn Fn(String) -> OpenFuture<S>>;

/// What the screen owns while it shows: closed and aborted when it goes or starts again.
pub(crate) struct Running<S: Session = ScrcpySession> {
    /// The open in progress: opening again or closing the window cancels it.
    starting: Option<AbortHandle>,
    session: Option<S>,
    pump: Option<AbortHandle>,
    /// The task that sends the view's input to the phone, in order.
    input: Option<AbortHandle>,
    key: Option<String>,
    /// The view attached and the video flows.
    attached: bool,
    /// Bumped by every stop: a task started for an earlier session sees it and does nothing.
    generation: u64,
    /// Where the video and the input of the session meet the view.
    registry: &'static sink::Registry,
    /// This screen's token for the dropped-moves counter of the metrics.
    metrics_owner: u64,
}

impl<S: Session> Running<S> {
    pub(crate) fn new(registry: &'static sink::Registry) -> Self {
        Self {
            starting: None,
            session: None,
            pump: None,
            input: None,
            key: None,
            attached: false,
            generation: 0,
            registry,
            metrics_owner: metrics::new_owner(),
        }
    }

    pub(crate) fn stop(&mut self) {
        self.generation = self.generation.wrapping_add(1);
        self.attached = false;
        for task in [self.starting.take(), self.pump.take(), self.input.take()]
            .into_iter()
            .flatten()
        {
            task.abort();
        }
        if let Some(session) = self.session.take() {
            session.close();
        }
        if let Some(key) = self.key.take() {
            self.registry.close(&key);
            metrics::clear_dropped_moves(self.metrics_owner);
        }
    }

    /// Keeps an opened session: its input channel and task, and its key in the registry.
    fn begin(&mut self, key: &str, session: S) {
        // One channel and one task for the input: the phone gets every message in the order
        // it was sent.
        let (sender, batches) = tokio::sync::mpsc::unbounded_channel();
        self.registry.open(key);
        self.registry.set_input(key, sender);
        if let Some(counter) = session.dropped_moves() {
            metrics::set_dropped_moves(self.metrics_owner, counter);
        }
        self.starting = None;
        self.input = Some(session.forward_input(batches));
        self.session = Some(session);
        self.key = Some(key.to_owned());
    }
}

impl<S: Session> Drop for Running<S> {
    /// A window's engine tears down without running cleanups: the last owner of the state
    /// (the screen, or a task the teardown cancels) closes the session as it goes.
    fn drop(&mut self) {
        self.stop();
    }
}

/// How an open went, for whoever asked for it.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Opened {
    Yes,
    No(String),
    /// A newer open, a stop or the window's close came first: this result is moot.
    Superseded,
}

/// The screen's controller (see the module docs).
pub(crate) struct Mirror<S: Session = ScrcpySession> {
    opener: Opener<S>,
    serial: String,
    state: Signal<MirrorView>,
    owner: Owner,
    running: RefCell<Running<S>>,
    reconnect: RefCell<Reconnect>,
    /// Why the stream or the last attempt failed, for the screen after giving up.
    last_error: RefCell<Option<String>>,
    connecting: String,
    live: String,
    lost: String,
    gave_up: String,
}

impl<S: Session> Mirror<S> {
    /// A controller under the current owner (call it while a component runs). Closing the
    /// window (the owner's cleanup) stops retrying and closes the session.
    pub(crate) fn new(
        opener: Opener<S>,
        serial: String,
        label: &str,
        reconnect: Reconnect,
    ) -> Rc<Self> {
        let mirror = Rc::new(Self {
            opener,
            serial,
            state: signal(MirrorView::Starting),
            owner: Owner::current(),
            running: RefCell::new(Running::new(sink::registry())),
            reconnect: RefCell::new(reconnect),
            last_error: RefCell::new(None),
            connecting: copy::mirror_connecting_announcement(label),
            live: copy::mirror_live_announcement(label),
            lost: copy::reconnecting_announcement(label),
            gave_up: copy::gave_up_announcement(label),
        });
        {
            let mirror = mirror.clone();
            cleanup(move || mirror.shut_down());
        }
        mirror
    }

    pub(crate) fn state(&self) -> Signal<MirrorView> {
        self.state
    }

    /// The window goes: no more attempts, and the session closes.
    fn shut_down(&self) {
        self.reconnect.borrow_mut().cancel();
        self.running.borrow_mut().stop();
    }

    /// Starts from scratch: the first open, or Retry after an open that failed.
    pub(crate) fn start(self: &Rc<Self>) {
        self.reconnect.borrow_mut().cancel();
        self.state.set(MirrorView::Starting);
        log::debug!("mirror: connecting to {}", self.serial);
        announce_for_accessibility(self.connecting.clone());
        self.open(|this, opened| {
            if let Opened::No(message) = opened {
                this.state.set(MirrorView::Failed(message));
            }
        });
    }

    /// Opens a session. Once it is open the screen shows the video (`Running`, which the view
    /// attaches to); `done` hears how it went, exactly once.
    fn open(self: &Rc<Self>, done: impl FnOnce(&Rc<Self>, Opened) + 'static) {
        self.running.borrow_mut().stop();
        let generation = self.running.borrow().generation;
        let this = self.clone();
        self.owner.run(|| {
            spawn(async move {
                // `background` needs the runtime a task runs in, not a listener's.
                if this.running.borrow().generation != generation {
                    return done(&this, Opened::Superseded);
                }
                let handle = background((this.opener)(this.serial.clone()));
                this.running.borrow_mut().starting = Some(handle.abort_handle());
                let result = handle.await;
                if this.running.borrow().generation != generation {
                    // Stopped while it opened: what it got is not wanted any more.
                    if let Ok(Ok(session)) = result {
                        session.close();
                    }
                    return done(&this, Opened::Superseded);
                }
                let next = match result {
                    Ok(Ok(session)) => {
                        let key = sink::new_key(&this.serial);
                        let (width, height) = session.video_size();
                        this.running.borrow_mut().begin(&key, session);
                        MirrorView::Running { key, width, height }
                    }
                    Ok(Err(message)) => {
                        log::warn!("mirror start failed: {message}");
                        return done(&this, Opened::No(message));
                    }
                    Err(error) => {
                        log::error!("mirror start task failed: {error}");
                        return done(&this, Opened::No(t(Key::MirrorFailed).to_owned()));
                    }
                };
                // The borrows above have ended: setting the state renders, which may stop.
                this.state.set(next);
                done(&this, Opened::Yes);
                // A view that never attaches (no native component) would leave the screen
                // connecting forever.
                timer(ATTACH_TIMEOUT).await;
                let attached = {
                    let running = this.running.borrow();
                    if running.generation != generation {
                        return;
                    }
                    running.attached
                };
                if !attached {
                    log::warn!("mirror: the video view never attached");
                    this.running.borrow_mut().stop();
                    this.reconnect.borrow_mut().cancel();
                    this.state
                        .set(MirrorView::Failed(t(Key::MirrorNoVideo).to_owned()));
                }
            })
        });
    }

    /// The view attached under `key`: only now does the video start flowing, so the codec
    /// configuration (the stream's first packet) always finds it.
    pub(crate) fn attached(self: &Rc<Self>, key: &str) {
        let (stream, generation) = {
            let mut running = self.running.borrow_mut();
            if running.key.as_deref() != Some(key) || running.attached {
                return;
            }
            let stream = running
                .session
                .as_mut()
                .and_then(|session| session.take_stream(key.to_owned()));
            running.attached = stream.is_some();
            (stream, running.generation)
        };
        let Some(stream) = stream else { return };
        announce_for_accessibility(self.live.clone());
        if let MirrorView::Running { width, height, .. } = self.state.get_untracked() {
            bench::start_from_env(key, width, height);
        }
        let this = self.clone();
        self.owner.run(|| {
            spawn(async move {
                if this.running.borrow().generation != generation {
                    return;
                }
                let handle = background(stream);
                this.running.borrow_mut().pump = Some(handle.abort_handle());
                let result = handle.await;
                // A pump of an older session (the screen stopped or opened again since) ends
                // without touching the current one.
                if this.running.borrow().generation != generation {
                    return;
                }
                let ended = match result {
                    Ok(reason) => reason,
                    Err(error) => Some(error.to_string()),
                };
                this.running.borrow_mut().stop();
                this.dropped(ended);
            })
        });
    }

    /// The stream ended while the screen lives (cable pulled, server killed): reconnect.
    fn dropped(self: &Rc<Self>, reason: Option<String>) {
        match &reason {
            Some(reason) => log::warn!("mirror stream of {} broke: {reason}", self.serial),
            None => log::warn!("mirror stream of {} ended", self.serial),
        }
        *self.last_error.borrow_mut() = reason;
        let next = self.reconnect.borrow_mut().begin(Instant::now());
        self.follow(next);
    }

    /// Try again (by hand) after the reconnect gave up: a full budget, whatever happened before.
    pub(crate) fn reconnect_again(self: &Rc<Self>) {
        let next = self.reconnect.borrow_mut().retry();
        self.follow(next);
    }

    fn follow(self: &Rc<Self>, next: Next) {
        let max = self.reconnect.borrow().max_attempts();
        match next {
            Next::AlreadyRunning => {}
            Next::GaveUp => {
                log::warn!(
                    "mirror: gave up reconnecting to {} after {max} attempts",
                    self.serial
                );
                announce_for_accessibility(self.gave_up.clone());
                let detail = self.last_error.borrow().clone();
                self.state.set(MirrorView::GaveUp(detail));
            }
            Next::Attempt {
                attempt,
                delay,
                run,
            } => {
                log::info!(
                    "mirror: reconnecting to {}, attempt {attempt}/{max} in {delay:?}",
                    self.serial
                );
                if attempt == 1 {
                    announce_for_accessibility(self.lost.clone());
                }
                self.state.set(MirrorView::Reconnecting { attempt, max });
                let this = self.clone();
                self.owner.run(|| {
                    spawn(async move {
                        timer(delay).await;
                        if !this.reconnect.borrow().is_current(run) {
                            return;
                        }
                        this.open(move |this, opened| this.attempted(run, attempt, opened));
                    })
                });
            }
        }
    }

    /// How attempt `attempt` of the cycle `run` went.
    fn attempted(self: &Rc<Self>, run: u64, attempt: usize, opened: Opened) {
        match opened {
            Opened::Yes => {
                log::info!(
                    "mirror: reconnected to {} on attempt {attempt}",
                    self.serial
                );
                self.reconnect.borrow_mut().succeeded(run, Instant::now());
            }
            Opened::No(message) => {
                log::warn!("mirror: reconnect attempt {attempt} failed: {message}");
                *self.last_error.borrow_mut() = Some(message);
                let next = self.reconnect.borrow_mut().failed(run);
                if let Some(next) = next {
                    self.follow(next);
                }
            }
            // Someone else took over the screen (a stop, a new start, the window's close):
            // this cycle ends, so the screen can never stay reconnecting with nothing running.
            Opened::Superseded => {
                let mut reconnect = self.reconnect.borrow_mut();
                if reconnect.is_current(run) {
                    reconnect.cancel();
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    use nsh_engine::{EngineConfig, Root};
    use nsh_testing::Headless;
    use tokio::sync::oneshot;

    use super::*;
    use crate::state::MirrorKind;

    /// What each open answers, the sessions it made and their closes.
    #[derive(Default)]
    struct Script {
        /// `true`: the open works; `false`: it fails. Empty: it fails.
        answers: Mutex<VecDeque<bool>>,
        opens: AtomicUsize,
        closes: AtomicUsize,
        /// Ends the stream of each session opened, in order.
        ends: Mutex<Vec<oneshot::Sender<Option<String>>>>,
        /// The keys the screen ran under.
        keys: Mutex<Vec<String>>,
    }

    impl Script {
        fn new(answers: &[bool]) -> Arc<Self> {
            Arc::new(Self {
                answers: Mutex::new(answers.iter().copied().collect()),
                ..Self::default()
            })
        }

        /// The stream of the last session opened breaks.
        fn drop_stream(&self) {
            let end = self.ends.lock().unwrap().pop();
            end.expect("a session is open")
                .send(Some("cable pulled".into()))
                .unwrap();
        }

        fn opens(&self) -> usize {
            self.opens.load(Ordering::SeqCst)
        }

        fn closes(&self) -> usize {
            self.closes.load(Ordering::SeqCst)
        }
    }

    struct Fake {
        script: Arc<Script>,
        stream: Option<oneshot::Receiver<Option<String>>>,
    }

    impl Session for Fake {
        fn video_size(&self) -> (u32, u32) {
            (100, 200)
        }

        fn forward_input(&self, mut batches: UnboundedReceiver<InputBatch>) -> AbortHandle {
            background(async move { while batches.recv().await.is_some() {} }).abort_handle()
        }

        fn take_stream(&mut self, _key: String) -> Option<StreamFuture> {
            let stream = self.stream.take()?;
            Some(Box::pin(async move { stream.await.unwrap_or(None) }))
        }

        fn close(self) {
            self.script.closes.fetch_add(1, Ordering::SeqCst);
        }
    }

    fn opener(script: Arc<Script>) -> Opener<Fake> {
        Rc::new(move |_serial| {
            let script = script.clone();
            Box::pin(async move {
                script.opens.fetch_add(1, Ordering::SeqCst);
                let works = script.answers.lock().unwrap().pop_front().unwrap_or(false);
                if !works {
                    return Err("sin teléfono".to_owned());
                }
                let (end, stream) = oneshot::channel();
                script.ends.lock().unwrap().push(end);
                Ok(Fake {
                    script: script.clone(),
                    stream: Some(stream),
                })
            })
        })
    }

    static NEXT: Mutex<Option<Arc<Script>>> = Mutex::new(None);
    static START: Mutex<()> = Mutex::new(());
    const CLOSE: &str = "Cerrar ventana (prueba)";
    const RETRY: &str = "Reintentar (prueba)";

    /// The controller with a screen that only says its state, and the view attaching as soon as
    /// the video shows, as the native one does. A button closes the "window".
    #[component]
    fn TestScreen() -> impl IntoElement {
        let script = NEXT.lock().unwrap().take().expect("the test sets a script");
        let open = signal(true);
        view()
            .child(when(
                move || open.get(),
                move || {
                    let delays = vec![Duration::from_millis(30); 3];
                    let mirror = Mirror::new(
                        opener(script.clone()),
                        "A1".into(),
                        "Pixel 8",
                        Reconnect::new(delays, Duration::from_secs(10)),
                    );
                    let state = mirror.state();
                    {
                        let (mirror, script) = (mirror.clone(), script.clone());
                        effect(move || {
                            if let MirrorView::Running { key, .. } = state.get() {
                                script.keys.lock().unwrap().push(key.clone());
                                mirror.attached(&key);
                            }
                        });
                    }
                    mirror.start();
                    view()
                        .child(text(move || match state.get() {
                            MirrorView::Reconnecting { attempt, max } => {
                                format!("reconectando {attempt}/{max}")
                            }
                            other => format!("{:?}", other.kind()).to_lowercase(),
                        }))
                        .child(
                            nsh_base::button()
                                .on_press(move || mirror.reconnect_again())
                                .child(text(RETRY)),
                        )
                },
            ))
            .child(
                nsh_base::button()
                    .on_press(move || open.set(false))
                    .child(text(CLOSE)),
            )
    }

    fn start(script: &Arc<Script>) -> (Headless, std::sync::MutexGuard<'static, ()>) {
        let guard = START
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *NEXT.lock().unwrap() = Some(script.clone());
        let app = Headless::start(EngineConfig::new(Root::of::<TestScreen>())).unwrap();
        (app, guard)
    }

    fn kind_text(kind: MirrorKind) -> String {
        format!("{kind:?}").to_lowercase()
    }

    fn leaked_registry() -> &'static sink::Registry {
        Box::leak(Box::default())
    }

    fn running(script: &Arc<Script>, registry: &'static sink::Registry) -> Running<Fake> {
        let mut running = Running::new(registry);
        running.session = Some(Fake {
            script: script.clone(),
            stream: None,
        });
        running.key = Some("A1#1".into());
        registry.open("A1#1");
        running
    }

    #[test]
    fn dropping_the_state_closes_the_session_and_its_key() {
        let script = Script::new(&[]);
        let registry = leaked_registry();
        let running = running(&script, registry);
        // The engine's teardown drops it without running the screen's cleanup.
        drop(running);
        assert_eq!(script.closes(), 1);
        assert!(!registry.is_open("A1#1"));
    }

    #[test]
    fn a_stop_then_a_drop_closes_each_once() {
        let script = Script::new(&[]);
        let registry = leaked_registry();
        let mut running = running(&script, registry);
        running.stop();
        assert_eq!(script.closes(), 1);
        assert!(!registry.is_open("A1#1"));
        // Something opens the key again: the drop that follows must not close it a second time.
        registry.open("A1#1");
        drop(running);
        assert_eq!(script.closes(), 1);
        assert!(registry.is_open("A1#1"));
    }

    #[test]
    fn a_drop_reconnects_and_the_video_comes_back() {
        let script = Script::new(&[true, false, true]);
        let (mut app, _guard) = start(&script);
        app.wait_for(&kind_text(MirrorKind::Running)).unwrap();
        script.drop_stream();
        // The first attempt fails, the second brings it back.
        app.wait_for("reconectando 1/3").unwrap();
        app.wait_for_within(&kind_text(MirrorKind::Running), Duration::from_secs(5))
            .unwrap();
        assert_eq!(script.opens(), 3);
        // The broken session was closed; the new one runs under a new key.
        assert_eq!(script.closes(), 1);
        let keys = script.keys.lock().unwrap().clone();
        assert_eq!(keys.len(), 2);
        assert!(!sink::registry().is_open(&keys[0]));
        assert!(sink::registry().is_open(&keys[1]));
    }

    #[test]
    fn it_gives_up_after_the_budget_and_try_again_gets_a_full_one() {
        let script = Script::new(&[true]);
        let (mut app, _guard) = start(&script);
        app.wait_for(&kind_text(MirrorKind::Running)).unwrap();
        script.drop_stream();
        app.wait_for_within(&kind_text(MirrorKind::GaveUp), Duration::from_secs(5))
            .unwrap();
        // The first open and the three attempts.
        assert_eq!(script.opens(), 4);
        app.idle(Duration::from_millis(100)).unwrap();
        assert_eq!(script.opens(), 4, "no attempt after giving up");
        // Try again: the whole budget once more, even though the drops spent it all.
        app.press(RETRY).unwrap();
        for _ in 0..100 {
            if script.opens() >= 7 {
                break;
            }
            app.idle(Duration::from_millis(20)).unwrap();
        }
        app.wait_for_within(&kind_text(MirrorKind::GaveUp), Duration::from_secs(5))
            .unwrap();
        assert_eq!(script.opens(), 7);
    }

    #[test]
    fn closing_mid_reconnect_releases_everything_and_stops_retrying() {
        let script = Script::new(&[true]);
        let (mut app, _guard) = start(&script);
        app.wait_for(&kind_text(MirrorKind::Running)).unwrap();
        script.drop_stream();
        app.wait_for("reconectando 1/3").unwrap();
        let opens = script.opens();
        app.press(CLOSE).unwrap();
        app.wait_for_gone("reconectando", Duration::from_secs(5))
            .unwrap();
        // Well past every delay of the budget: no attempt ran after the close.
        app.idle(Duration::from_millis(300)).unwrap();
        assert!(
            script.opens() <= opens + 1,
            "at most the attempt already running"
        );
        let keys = script.keys.lock().unwrap().clone();
        assert!(keys.iter().all(|key| !sink::registry().is_open(key)));
        // The one session that opened was closed.
        assert_eq!(script.closes(), 1);
    }
}
