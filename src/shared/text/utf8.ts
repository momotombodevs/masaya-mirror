const encoder = new TextEncoder();

/** Size of `text` once encoded as UTF-8, which is what scrcpy's limits are measured in. */
export function utf8ByteLength(text: string): number {
  return encoder.encode(text).byteLength;
}
