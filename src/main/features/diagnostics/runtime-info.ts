import { app } from 'electron';
import type { RuntimeInfo } from './diagnostic-report';

export function getRuntimeInfo(): RuntimeInfo {
  return {
    appVersion: app.getVersion(),
    packaged: app.isPackaged,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    osVersion: process.getSystemVersion(),
    arch: process.arch,
  };
}
