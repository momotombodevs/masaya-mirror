import { getMainLocale } from '../../i18n';
import { getEventCounts, readRecentLogLines, redactHome } from '../../logging/log';
import type { AdbService } from '../device/adb.service';
import { buildDiagnosticReport, REPORT_LOG_LINES } from './diagnostic-report';
import { getRuntimeInfo } from './runtime-info';

/** Gathers versions, adb and the connected phones, and the recent log into one report. */
export async function collectDiagnosticReport(adbService: AdbService): Promise<string> {
  const [adbPath, adbVersion, devices] = await Promise.all([
    adbService.getExecutablePath(),
    adbService.getVersion(),
    adbService.listDevices(),
  ]);
  return buildDiagnosticReport({
    generatedAt: new Date(),
    runtime: getRuntimeInfo(),
    locale: getMainLocale(),
    adbPath: adbPath === null ? null : redactHome(adbPath),
    adbVersion,
    devices,
    eventCounts: getEventCounts(),
    logLines: readRecentLogLines(REPORT_LOG_LINES),
  });
}
