import { webUtils } from 'electron';

export const filesApi = {
  /** Absolute path of a file dropped on the window. Empty when the file has no path on disk. */
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
};
