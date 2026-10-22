import { utf8ByteLength } from '../../../shared/text/utf8';

/** The computer's clipboard, as far as the sync needs it. */
export type SystemClipboard = {
  readText(): string;
  writeText(text: string): void;
};

/** The reading half of a stream of text; both the DOM and the scrcpy library streams fit it. */
type TextStream = {
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

function isSyncable(text: string): boolean {
  return text.length > 0 && utf8ByteLength(text) <= MAX_CLIPBOARD_BYTES;
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
    // Cancelling a stream that already ended or failed has nothing left to report.
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
    } catch (error: unknown) {
      // Forget the text so the next sync tries again instead of assuming the device has it.
      this.lastText = null;
      if (!this.stopped) {
        console.error('[clipboard] could not send the clipboard to the device', error);
      }
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
    } catch (error: unknown) {
      // The stream is cancelled with the session; only a failure while it lives is news.
      if (!this.stopped) {
        console.error('[clipboard] the device clipboard stream failed', error);
      }
    }
  }
}
