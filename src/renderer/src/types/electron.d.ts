import type { ManoloApi } from '../../../preload/manolo.api';

declare global {
  interface Window {
    readonly manolo: ManoloApi;
  }
}

export {};
