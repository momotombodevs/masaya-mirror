import { deviceApi } from './device.api';
import { mirrorApi } from './mirror.api';
import { qaApi } from './qa.api';

export const manoloApi = {
  ...deviceApi,
  ...mirrorApi,
  ...qaApi,
};
