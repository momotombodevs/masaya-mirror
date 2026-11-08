//! The device list's state and the task that keeps it fresh. It belongs to the shell, so going to
//! the mirror and back keeps the list (no loading state and no `adb start-server` again).

use std::cell::{Cell, RefCell};
use std::rc::Rc;
use std::sync::Arc;
use std::time::Duration;

use nsh_core::prelude::*;
use tokio::sync::Notify;
use tokio::task::AbortHandle;

use crate::i18n::{Key, t};
use crate::source::{DeviceSource, DevicesResult, LoadError};
use crate::state::{DevicesModel, DevicesView};

pub const REFRESH_EVERY: Duration = Duration::from_secs(2);

/// What the screens read and the retry they ask for. Cheap to clone.
#[derive(Clone)]
pub struct DevicesStore {
    view: Signal<DevicesView>,
    model: Rc<RefCell<DevicesModel>>,
    retry: Rc<RetryState>,
}

struct RetryState {
    wake: Arc<Notify>,
    /// Bumped by each retry, so a load that was running when the user asked is dropped.
    generation: Cell<u64>,
    loading: Cell<bool>,
}

impl DevicesStore {
    /// Starts loading under the current owner: the task, and an adb call it is waiting for,
    /// stop when the owner goes.
    pub fn start(source: Arc<dyn DeviceSource>) -> Self {
        let store = Self {
            view: signal(DevicesView::Loading),
            model: Rc::new(RefCell::new(DevicesModel::default())),
            retry: Rc::new(RetryState {
                wake: Arc::new(Notify::new()),
                generation: Cell::new(0),
                loading: Cell::new(false),
            }),
        };

        let in_flight: Rc<RefCell<Option<AbortHandle>>> = Rc::new(RefCell::new(None));
        {
            let in_flight = in_flight.clone();
            cleanup(move || {
                if let Some(handle) = in_flight.borrow_mut().take() {
                    handle.abort();
                }
            });
        }

        let task = store.clone();
        spawn(async move {
            let mut start_server = true;
            loop {
                let generation = task.retry.generation.get();
                task.retry.loading.set(true);
                let result = load(&source, start_server, &in_flight).await;
                task.retry.loading.set(false);
                if task.retry.generation.get() != generation {
                    // The user asked again while this load ran: their fresh load replaces it.
                    start_server = true;
                    continue;
                }
                let logged = task.model.borrow_mut().apply(result);
                if let Some(detail) = logged {
                    log::warn!("device list failed: {detail}");
                }
                // An equal view is not written again, so an unchanged list does not redraw.
                task.view.set(task.model.borrow().view.clone());
                start_server = tokio::select! {
                    biased;
                    () = task.retry.wake.notified() => true,
                    () = timer(REFRESH_EVERY) => false,
                };
            }
        });
        store
    }

    pub fn view(&self) -> Signal<DevicesView> {
        self.view
    }

    /// Loads again now, starting adb. Shows loading only when there is no list to keep showing.
    pub fn retry(&self) {
        self.model.borrow_mut().retry();
        self.view.set(self.model.borrow().view.clone());
        self.retry
            .generation
            .set(self.retry.generation.get().wrapping_add(1));
        // A running load ends on its own and sees the new generation; waking it as well would
        // run `start-server` twice.
        if !self.retry.loading.get() {
            self.retry.wake.notify_one();
        }
    }
}

/// Runs one load off the engine thread. A load that panics is an error, not a frozen list.
async fn load(
    source: &Arc<dyn DeviceSource>,
    start_server: bool,
    in_flight: &RefCell<Option<AbortHandle>>,
) -> DevicesResult {
    let handle = background(source.clone().list(start_server));
    *in_flight.borrow_mut() = Some(handle.abort_handle());
    let joined = handle.await;
    in_flight.borrow_mut().take();
    joined.unwrap_or_else(|error| {
        log::error!("device list task failed: {error}");
        Err(LoadError::other(t(Key::ListFailed)))
    })
}
