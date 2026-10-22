/**
 * Properties that hold a phone's marketing name, best first. Xiaomi fills the `marketname` pair,
 * Oppo/OnePlus/Realme the `oplus` one and Huawei `marketing_name`. `ro.product.model` is the last
 * resort: friendly on Pixels and Motorolas, a code ("SM-S918B") on Samsungs.
 */
export const DEVICE_NAME_PROPS = [
  'ro.product.marketname',
  'ro.product.vendor.marketname',
  'ro.vendor.oplus.market.name',
  'ro.config.marketing_name',
  'ro.product.model',
] as const;

/** One `adb shell` call that prints `prop=value` for every name property, empty when unset. */
export const DEVICE_NAME_SHELL_COMMAND = `for p in ${DEVICE_NAME_PROPS.join(' ')}; do echo "$p=$(getprop $p)"; done`;

/**
 * Samsung never sets a marketing name property, so its model codes are mapped here. The key is
 * the code without the region suffix: SM-S918B, SM-S918U and SM-S918N are all an S23 Ultra.
 */
const SAMSUNG_MODELS: Readonly<Record<string, string>> = {
  G780: 'Galaxy S20 FE',
  G781: 'Galaxy S20 FE 5G',
  G980: 'Galaxy S20',
  G981: 'Galaxy S20 5G',
  G985: 'Galaxy S20+',
  G986: 'Galaxy S20+ 5G',
  G988: 'Galaxy S20 Ultra',
  G990: 'Galaxy S21 FE',
  G991: 'Galaxy S21',
  G996: 'Galaxy S21+',
  G998: 'Galaxy S21 Ultra',
  S901: 'Galaxy S22',
  S906: 'Galaxy S22+',
  S908: 'Galaxy S22 Ultra',
  S711: 'Galaxy S23 FE',
  S911: 'Galaxy S23',
  S916: 'Galaxy S23+',
  S918: 'Galaxy S23 Ultra',
  S721: 'Galaxy S24 FE',
  S921: 'Galaxy S24',
  S926: 'Galaxy S24+',
  S928: 'Galaxy S24 Ultra',
  S731: 'Galaxy S25 FE',
  S931: 'Galaxy S25',
  S936: 'Galaxy S25+',
  S937: 'Galaxy S25 Edge',
  S938: 'Galaxy S25 Ultra',
  F711: 'Galaxy Z Flip3',
  F926: 'Galaxy Z Fold3',
  F721: 'Galaxy Z Flip4',
  F936: 'Galaxy Z Fold4',
  F731: 'Galaxy Z Flip5',
  F946: 'Galaxy Z Fold5',
  F741: 'Galaxy Z Flip6',
  F956: 'Galaxy Z Fold6',
  F761: 'Galaxy Z Flip7 FE',
  F766: 'Galaxy Z Flip7',
  F966: 'Galaxy Z Fold7',
  A135: 'Galaxy A13',
  A145: 'Galaxy A14',
  A146: 'Galaxy A14 5G',
  A155: 'Galaxy A15',
  A156: 'Galaxy A15 5G',
  A165: 'Galaxy A16',
  A166: 'Galaxy A16 5G',
  A245: 'Galaxy A24',
  A256: 'Galaxy A25',
  A266: 'Galaxy A26',
  A336: 'Galaxy A33',
  A346: 'Galaxy A34',
  A356: 'Galaxy A35',
  A366: 'Galaxy A36',
  A525: 'Galaxy A52',
  A526: 'Galaxy A52 5G',
  A528: 'Galaxy A52s',
  A536: 'Galaxy A53',
  A546: 'Galaxy A54',
  A556: 'Galaxy A55',
  A566: 'Galaxy A56',
  A725: 'Galaxy A72',
};

/** `adb devices -l` turns every dash into an underscore, so "SM_S918B" and "SM-S918B" both match. */
const SAMSUNG_MODEL_CODE = /^SM[-_]([A-Z]\d{3})/i;

/** The marketing name for a model code, or the model itself when it is not a known Samsung. */
export function friendlyModelName(model: string): string {
  const code = SAMSUNG_MODEL_CODE.exec(model)?.[1]?.toUpperCase();
  return (code && SAMSUNG_MODELS[code]) ?? model;
}

/** Picks the best name from the output of {@link DEVICE_NAME_SHELL_COMMAND}, if any. */
export function parseDeviceName(stdout: string): string | undefined {
  const values = new Map<string, string>();
  for (const line of stdout.split('\n')) {
    const separator = line.indexOf('=');
    if (separator > 0) {
      values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
    }
  }
  const name = DEVICE_NAME_PROPS.map((prop) => values.get(prop)).find((value) => value);
  return name ? friendlyModelName(name) : undefined;
}
