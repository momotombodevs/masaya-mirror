import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { ok, err, type Result } from '../../../shared/ipc/result';
import { MAIN_DIST, RENDERER_DIST, VITE_DEV_SERVER_URL, createSecureWindow } from '../../app';
import type { ScrcpyService } from './scrcpy.service';
import { computeStageHeight, TOOLBAR_CONTENT_HEIGHT } from './mirror-layout';

export type MirrorWindowServiceDeps = {
  readonly scrcpyService: ScrcpyService;
};

function buildMirrorLoadOptions(
  deviceId: string,
  deviceLabel: string,
): { url: string } | { file: string; query: Record<string, string> } {
  const query = { deviceId, label: deviceLabel };

  if (VITE_DEV_SERVER_URL) {
    const url = new URL(VITE_DEV_SERVER_URL);
    url.searchParams.set('deviceId', deviceId);
    url.searchParams.set('label', deviceLabel);
    return { url: url.toString() };
  }

  return {
    file: path.join(RENDERER_DIST, 'index.html'),
    query,
  };
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
      backgroundColor: '#09090b',
      webPreferences: {
        preload: path.join(MAIN_DIST, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });

    this.windows.set(deviceId, win);

    win.on('closed', () => {
      this.windows.delete(deviceId);
      this.layoutApplied.delete(deviceId);
      void this.deps.scrcpyService.closeMirror(deviceId);
    });

    const loadTarget = buildMirrorLoadOptions(deviceId, deviceLabel);
    if ('url' in loadTarget) {
      await win.loadURL(loadTarget.url);
    } else {
      await win.loadFile(loadTarget.file, { query: loadTarget.query });
    }

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
      const aspectRatio = videoWidth / videoHeight;
      const workArea = screen.getPrimaryDisplay().workAreaSize;
      const stageHeight = computeStageHeight(videoHeight, workArea.height);
      const stageWidth = Math.round(stageHeight * aspectRatio);
      const contentWidth = Math.max(MIN_CONTENT_WIDTH, stageWidth);
      const contentHeight = Math.max(
        MIN_CONTENT_HEIGHT,
        stageHeight + TOOLBAR_CONTENT_HEIGHT,
      );
      win.setContentSize(contentWidth, contentHeight);
    }

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
