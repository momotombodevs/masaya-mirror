import { type BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ok, err, type Result } from '../../../shared/ipc/result';
import { createSecureWindow } from '../../secure-window';
import { RENDERER_DIST, VITE_DEV_SERVER_URL } from '../../paths';
import type { ScrcpyService } from './scrcpy.service';
import {
  computeStageSize,
  NAVIGATION_BAR_HEIGHT,
  orientationOf,
  rotatedStageSize,
  TOOLBAR_CONTENT_HEIGHT,
  type Orientation,
} from './mirror-layout';

export type MirrorWindowServiceDeps = {
  readonly scrcpyService: ScrcpyService;
  /** Whether new windows show the navigation bar, which takes room under the screen. */
  readonly isNavigationBarShown?: () => boolean;
};

/** URL of the renderer entry (dev server or packaged file) targeting one device. */
function buildMirrorUrl(deviceId: string, deviceLabel: string): string {
  const url = new URL(VITE_DEV_SERVER_URL ?? pathToFileURL(path.join(RENDERER_DIST, 'index.html')));
  url.searchParams.set('deviceId', deviceId);
  url.searchParams.set('label', deviceLabel);
  return url.toString();
}

const MIN_CONTENT_WIDTH = 280;
const MIN_CONTENT_HEIGHT = 480;
/** A landscape phone is short, so its window may be shorter than a portrait one. */
const MIN_CONTENT_HEIGHT_LANDSCAPE = 300;

export class MirrorWindowService {
  private readonly windows = new Map<string, BrowserWindow>();
  private readonly layoutApplied = new Set<string>();
  private readonly orientations = new Map<string, Orientation>();
  /** Tail of the open queue per device, so two opens never interleave. */
  private readonly openChains = new Map<string, Promise<unknown>>();

  constructor(private readonly deps: MirrorWindowServiceDeps) {}

  /** Opens (or replaces) the window of a device. Calls for the same device run one at a time. */
  open(deviceId: string, deviceLabel: string): Promise<Result<void>> {
    const run = (this.openChains.get(deviceId) ?? Promise.resolve()).then(() =>
      this.openNow(deviceId, deviceLabel),
    );
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.openChains.set(deviceId, tail);
    void tail.then(() => {
      if (this.openChains.get(deviceId) === tail) {
        this.openChains.delete(deviceId);
      }
    });
    return run;
  }

  /** Drops everything remembered about a device's window, so a new one starts from scratch. */
  private forget(deviceId: string): void {
    this.windows.delete(deviceId);
    this.layoutApplied.delete(deviceId);
    this.orientations.delete(deviceId);
  }

  private async openNow(deviceId: string, deviceLabel: string): Promise<Result<void>> {
    const existing = this.windows.get(deviceId);
    if (existing) {
      // Its 'closed' handler would otherwise forget the window that replaces it.
      existing.removeAllListeners('closed');
      this.forget(deviceId);
      if (!existing.isDestroyed()) {
        existing.close();
      }
    }

    await this.deps.scrcpyService.closeMirror(deviceId);

    const win = createSecureWindow(
      {
        width: 400,
        height: 860,
        minWidth: MIN_CONTENT_WIDTH,
        minHeight: MIN_CONTENT_HEIGHT,
        title: deviceLabel,
        autoHideMenuBar: true,
        backgroundColor: '#000000',
      },
      // A covered window keeps drawing the phone: recordings stay smooth and there is no
      // catch-up stall when it shows again. Video decoding runs either way.
      { backgroundThrottling: false },
    );

    this.windows.set(deviceId, win);

    // Whatever was copied on the computer while the window was in the background goes to the phone.
    win.on('focus', () => void this.deps.scrcpyService.syncClipboardToDevice(deviceId));

    win.on('closed', () => {
      this.forget(deviceId);
      void this.deps.scrcpyService.closeMirror(deviceId);
    });

    await win.loadURL(buildMirrorUrl(deviceId, deviceLabel));

    return ok(undefined);
  }

  getOpenDeviceIds(): readonly string[] {
    return [...this.windows.keys()];
  }

  isSenderForDevice(deviceId: string, senderId: number): boolean {
    const win = this.windows.get(deviceId);
    return Boolean(win && !win.isDestroyed() && win.webContents.id === senderId);
  }

  isMirrorWindowSender(senderId: number): boolean {
    for (const win of this.windows.values()) {
      if (!win.isDestroyed() && win.webContents.id === senderId) {
        return true;
      }
    }

    return false;
  }

  setVideoLayout(deviceId: string, videoWidth: number, videoHeight: number): Result<void> {
    const win = this.windows.get(deviceId);
    if (!win || win.isDestroyed()) {
      return err('No mirror window exists for this device.');
    }

    if (videoWidth <= 0 || videoHeight <= 0) {
      return err('Invalid video dimensions.');
    }

    win.setAspectRatio(0);

    const video = { width: videoWidth, height: videoHeight };
    const orientation = orientationOf(video);
    const previousOrientation = this.orientations.get(deviceId);
    this.orientations.set(deviceId, orientation);

    const navigationBarHeight = this.deps.isNavigationBarShown?.() ? NAVIGATION_BAR_HEIGHT : 0;
    const chromeHeight = TOOLBAR_CONTENT_HEIGHT + navigationBarHeight;
    const { workAreaSize } = screen.getDisplayMatching(win.getBounds());

    if (!this.layoutApplied.has(deviceId)) {
      this.layoutApplied.add(deviceId);
      const stage = computeStageSize(video, workAreaSize, navigationBarHeight);
      this.resizeContent(win, stage, chromeHeight, orientation);
    } else if (previousOrientation && previousOrientation !== orientation) {
      // The phone turned: turn the window with it, unless the user has it full screen.
      if (!win.isFullScreen() && !win.isMaximized()) {
        const [contentWidth, contentHeight] = win.getContentSize();
        const currentStage = {
          width: contentWidth ?? 0,
          height: Math.max(0, (contentHeight ?? 0) - chromeHeight),
        };
        const stage = rotatedStageSize(currentStage, video, workAreaSize, navigationBarHeight);
        this.resizeContent(win, stage, chromeHeight, orientation);
      }
    }

    return ok(undefined);
  }

  private resizeContent(
    win: BrowserWindow,
    stage: { readonly width: number; readonly height: number },
    chromeHeight: number,
    orientation: Orientation,
  ): void {
    const minHeight =
      orientation === 'landscape' ? MIN_CONTENT_HEIGHT_LANDSCAPE : MIN_CONTENT_HEIGHT;
    win.setMinimumSize(MIN_CONTENT_WIDTH, minHeight);
    win.setContentSize(
      Math.max(MIN_CONTENT_WIDTH, stage.width),
      Math.max(minHeight, stage.height + chromeHeight),
    );
  }

  setAlwaysOnTop(deviceId: string, enabled: boolean): Result<void> {
    const win = this.windows.get(deviceId);
    if (!win || win.isDestroyed()) {
      return err('No mirror window exists for this device.');
    }
    // 'floating' keeps it above normal windows on macOS without covering system UI.
    win.setAlwaysOnTop(enabled, 'floating');
    return ok(undefined);
  }

  closeAll(): void {
    for (const [deviceId, win] of [...this.windows]) {
      this.forget(deviceId);
      if (!win.isDestroyed()) {
        win.close();
      }
    }
  }
}
