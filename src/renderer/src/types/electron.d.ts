import type { MasayaApi } from '../../../preload/masaya.api';

declare global {
  interface Window {
    readonly masaya: MasayaApi;
  }
}

export {};
