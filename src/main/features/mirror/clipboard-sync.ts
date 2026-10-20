/** The computer's clipboard, as far as the sync needs it. */
export type SystemClipboard = {
  readText(): string;
  writeText(text: string): void;
};

/** The reading half of a stream of text; both the DOM and the scrcpy library streams fit it. */
export type TextStream = {
  getReader(): TextReader;
};

type TextReader = {
  read(): Promise<{ done: boolean; value?: string }>;
  cancel(reason?: unknown): Promise<void>;
};

export type ClipboardSyncDeps = {
  readonly system: SystemClipboard;
  /** Puts text on the device clipboard. */
  readonly setDeviceText: (text: string) => Promise<void>;
  /** Text the device copies, as scrcpy reports it. */
  readonly deviceText: TextStream;
};

/** scrcpy refuses clipboard text above 256 KiB; larger text is not synced. */
export const MAX_CLIPBOARD_BYTES = 256 * 1024;

const encoder = new TextEncoder();

function isSyncable(text: string): boolean {
  return text.length > 0 && encoder.encode(text).byteLength <= MAX_CLIPBOARD_BYTES;
}

/**
 * Keeps the computer and device clipboards equal. Device copies reach the computer as they
 * happen; the computer's clipboard is sent on demand (window focus, before a paste). The last
 * text moved either way is remembered so each change is applied once and never echoed back.
 */
export class ClipboardSync {
  private lastText: string | null = null;
  private reader: TextReader | null = null;
  private stopped = false;

  constructor(private readonly deps: ClipboardSyncDeps) {}

  start(): void {
    this.reader = this.deps.deviceText.getReader();
    void this.pump(this.reader);
  }

  stop(): void {
    this.stopped = true;
    void this.reader?.cancel().catch(() => undefined);
    this.reader = null;
  }

  /** Sends the computer's clipboard to the device if it changed since the last sync. */
  async pushToDevice(): Promise<void> {
    if (this.stopped) {
      return;
    }
    const text = this.deps.system.readText();
    if (text === this.lastText || !isSyncable(text)) {
      return;
    }
    this.lastText = text;
    try {
      await this.deps.setDeviceText(text);
    } catch {
      // The session is closing; the next sync after reconnecting sends it again.
      this.lastText = null;
    }
  }

  private async pump(reader: TextReader): Promise<void> {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done || value === undefined) {
          return;
        }
        if (value !== this.lastText && isSyncable(value)) {
          this.lastText = value;
          this.deps.system.writeText(value);
        }
      }
    } catch {
      // The stream ends with the session.
    }
  }
}
