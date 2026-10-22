import { clipboard } from 'electron';
import type { SystemClipboard } from './clipboard-sync';

export const systemClipboard: SystemClipboard = {
  readText: () => clipboard.readText(),
  writeText: (text) => clipboard.writeText(text),
};
