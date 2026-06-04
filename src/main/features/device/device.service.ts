import type { AndroidDevice } from '../../../shared/device/types';
import { AdbService } from './adb.service';
import type { Result } from '../../../shared/ipc/result';

export class DeviceService {
  constructor(private readonly adbService: AdbService = new AdbService()) {}

  discoverDevices(): Promise<Result<readonly AndroidDevice[]>> {
    return this.adbService.listDevices();
  }
}
