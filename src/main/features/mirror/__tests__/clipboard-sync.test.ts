import { describe, expect, it, vi } from 'vitest';
import { ClipboardSync, MAX_CLIPBOARD_BYTES } from '../clipboard-sync';

function setup(initial = '') {
  let controller!: ReadableStreamDefaultController<string>;
  const deviceText = new ReadableStream<string>({
    start: (c) => {
      controller = c;
    },
  });
  const system = { text: initial, readText: () => system.text, writeText: vi.fn() };
  system.writeText.mockImplementation((text: string) => {
    system.text = text;
  });
  const setDeviceText = vi.fn().mockResolvedValue(undefined);
  const sync = new ClipboardSync({
    system,
    setDeviceText,
    deviceText: { getReader: () => deviceText.getReader() },
  });
  sync.start();
  const copyOnDevice = async (text: string): Promise<void> => {
    controller.enqueue(text);
    await vi.waitFor(() => expect(system.writeText).toHaveBeenCalled());
  };
  return { sync, system, setDeviceText, controller, copyOnDevice };
}

describe('ClipboardSync', () => {
  it('writes what the device copies to the computer clipboard', async () => {
    const { system, copyOnDevice } = setup();

    await copyOnDevice('from phone');

    expect(system.writeText).toHaveBeenCalledWith('from phone');
  });

  it('sends the computer clipboard to the device once per change', async () => {
    const { sync, system, setDeviceText } = setup('from pc');

    await sync.pushToDevice();
    await sync.pushToDevice();
    system.text = 'newer';
    await sync.pushToDevice();

    expect(setDeviceText.mock.calls).toEqual([['from pc'], ['newer']]);
  });

  it('does not echo device text back to the device', async () => {
    const { sync, setDeviceText, copyOnDevice } = setup();

    await copyOnDevice('from phone');
    await sync.pushToDevice();

    expect(setDeviceText).not.toHaveBeenCalled();
  });

  it('does not write device text the computer already has to the clipboard again', async () => {
    const { sync, system, controller } = setup('same');

    await sync.pushToDevice();
    controller.enqueue('same');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(system.writeText).not.toHaveBeenCalled();
  });

  it('skips empty and oversized text', async () => {
    const { sync, system, setDeviceText } = setup('');

    await sync.pushToDevice();
    system.text = 'x'.repeat(MAX_CLIPBOARD_BYTES + 1);
    await sync.pushToDevice();

    expect(setDeviceText).not.toHaveBeenCalled();
  });

  it('retries the same text later if sending failed, and says so', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { sync, setDeviceText } = setup('from pc');
    setDeviceText.mockRejectedValueOnce(new Error('closed'));

    await sync.pushToDevice();
    await sync.pushToDevice();

    expect(setDeviceText).toHaveBeenCalledTimes(2);
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });

  it('logs a device clipboard stream that fails while syncing', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { controller } = setup();

    controller.error(new Error('stream broke'));

    await vi.waitFor(() => expect(logged).toHaveBeenCalledTimes(1));
    logged.mockRestore();
  });

  it('does nothing after stop', async () => {
    const { sync, setDeviceText } = setup('from pc');

    sync.stop();
    await sync.pushToDevice();

    expect(setDeviceText).not.toHaveBeenCalled();
  });
});
