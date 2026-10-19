import { type BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ok, err, type Result } from '../../../shared/ipc/result';
import { createSecureWindow } from '../../app';
import { RENDERER_DIST, VITE_DEV_SERVER_URL } from '../../paths';
import type { ScrcpyService } from './scrcpy.service';
import { computeStageSize, NAVIGATION_BAR_HEIGHT, TOOLBAR_CONTENT_HEIGHT } from './mirror-layout';

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

export class MirrorWindowService {
  private readonly windows = new Map<string, BrowserWindow>();
  private readonly layoutApplied = new Set<string>();

  constructor(private readonly deps: MirrorWindowServiceDeps) {}

  async open(deviceId: string, deviceLabel: string): Promise<Result<void>> {
    const existing = this.windows.get(deviceId);
    if (existing && !existing.isDestroyed()) {
      existing.removeAllListeners('closed');
      existing.close();
      this.windows.delete(deviceId);
    }

    await this.deps.scrcpyService.closeMirror(deviceId);

    const win = createSecureWindow({
      width: 400,
      height: 860,
      minWidth: MIN_CONTENT_WIDTH,
      minHeight: MIN_CONTENT_HEIGHT,
      title: deviceLabel,
      autoHideMenuBar: true,
      backgroundColor: '#000000',
    });

    this.windows.set(deviceId, win);

    win.on('closed', () => {
      this.windows.delete(deviceId);
      this.layoutApplied.delete(deviceId);
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

    if (!this.layoutApplied.has(deviceId)) {
      this.layoutApplied.add(deviceId);
      const { workAreaSize } = screen.getDisplayMatching(win.getBounds());
      const navigationBarHeight = this.deps.isNavigationBarShown?.() ? NAVIGATION_BAR_HEIGHT : 0;
      const stage = computeStageSize(
        { width: videoWidth, height: videoHeight },
        workAreaSize,
        navigationBarHeight,
      );
      const contentWidth = Math.max(MIN_CONTENT_WIDTH, stage.width);
      const contentHeight = Math.max(
        MIN_CONTENT_HEIGHT,
        stage.height + TOOLBAR_CONTENT_HEIGHT + navigationBarHeight,
      );
      win.setContentSize(contentWidth, contentHeight);
    }

    return ok(undefined);
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
    for (const deviceId of [...this.windows.keys()]) {
      const win = this.windows.get(deviceId);
      if (win && !win.isDestroyed()) {
        win.close();
      }
    }
    this.windows.clear();
  }
}
