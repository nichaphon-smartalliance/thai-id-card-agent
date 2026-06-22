/**
 * Enriches PC/SC reader names with the underlying USB device's vendor/model.
 *
 * Why: most cheap readers use a shared inbox CCID driver, so PC/SC reports a
 * generic name like "Generic EMV Smartcard Reader 0" regardless of brand. The
 * real identity (chip vendor) lives in the USB descriptor (VID/PID), which we
 * read on Windows via PowerShell's Get-PnpDevice, then correlate back to each
 * PC/SC reader through its BusReportedDeviceDesc.
 *
 * Note: the *box brand* (the name printed on the casing) is NOT stored anywhere
 * queryable - only the USB chip vendor is. Two different-brand readers that use
 * the same chip (e.g. Alcor Micro AU9540) are therefore indistinguishable
 * beyond their VID/PID + enumeration index.
 */

export interface ReaderDetail {
  /** PC/SC name - pass THIS as ?readerName= to /data. */
  name: string;
  /** Chip vendor mapped from the USB VID, e.g. "Alcor Micro". */
  vendor: string | null;
  /** USB vendor id (hex), e.g. "058F". */
  vid: string | null;
  /** USB product id (hex), e.g. "9540". */
  pid: string | null;
  /** USB bus-reported description, e.g. "EMV Smartcard Reader". */
  usb: string | null;
  /** Friendly label combining vendor + name for display in a UI. */
  label: string;
}

interface UsbDev {
  bus: string;
  vid: string;
  pid: string;
}

/** Common smart-card-reader USB vendor IDs (lowercase) -> vendor name. */
const USB_VENDORS: Record<string, string> = {
  "058f": "Alcor Micro",
  "0bda": "Realtek",
  "072f": "ACS (Advanced Card Systems)",
  "08e6": "Gemalto",
  "04e6": "Identiv (SCM)",
  "076b": "HID Global (OMNIKEY)",
  "0c4b": "REINER SCT",
  "09c3": "HID / ActivIdentity",
  "0483": "STMicroelectronics",
  "1a86": "QinHeng (CH)",
  "0dc3": "Athena",
  "0b97": "O2Micro",
  "1fc9": "NXP",
  "0471": "Philips",
  "03f0": "HP",
  "413c": "Dell",
  "0e0f": "VMware (virtual)",
  "058b": "Infineon",
  "096e": "Feitian",
  "1050": "Yubico",
  "0d46": "KOBIL",
  "04b9": "SafeNet",
  "20a0": "Nitrokey",
  "0a89": "Aktiv (Rutoken)",
  "046a": "Cherry",
};

const PS_SCRIPT =
  "$l = Get-PnpDevice -Class SmartCardReader -PresentOnly -ErrorAction SilentlyContinue | " +
  "ForEach-Object { $id=$_.InstanceId; " +
  "$b=(Get-PnpDeviceProperty -InstanceId $id -KeyName 'DEVPKEY_Device_BusReportedDeviceDesc' -ErrorAction SilentlyContinue).Data; " +
  "$v=if($id -match 'VID_([0-9A-Fa-f]{4})'){$matches[1]}else{''}; " +
  "$p=if($id -match 'PID_([0-9A-Fa-f]{4})'){$matches[1]}else{''}; " +
  "[pscustomobject]@{bus=$b;vid=$v;pid=$p} }; " +
  "ConvertTo-Json -InputObject @($l) -Compress";

let cache: { at: number; devices: UsbDev[] } | null = null;
const CACHE_MS = 8000;

/** Query USB smart-card readers via PowerShell (Windows only). Cached ~8s. */
async function queryUsbDevices(): Promise<UsbDev[]> {
  if (process.platform !== "win32") return [];
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.devices;

  try {
    const proc = Bun.spawn(
      ["powershell", "-NoProfile", "-NonInteractive", "-Command", PS_SCRIPT],
      { stdout: "pipe", stderr: "ignore", timeout: 6000 },
    );
    const text = (await new Response(proc.stdout).text()).trim();
    await proc.exited;

    let parsed: unknown = text ? JSON.parse(text) : [];
    if (!Array.isArray(parsed)) parsed = [parsed]; // single device -> object
    const devices: UsbDev[] = (parsed as UsbDev[])
      .filter((d) => d && (d.vid || d.bus))
      .map((d) => ({
        bus: String(d.bus ?? ""),
        vid: String(d.vid ?? ""),
        pid: String(d.pid ?? ""),
      }));

    cache = { at: Date.now(), devices };
    return devices;
  } catch (err) {
    console.error("[reader-info] USB enumeration failed:", err);
    return [];
  }
}

/** Map each PC/SC reader name to a USB device via its bus description. */
function correlate(names: string[], devices: UsbDev[]): Map<string, UsbDev> {
  const byBus = new Map<string, UsbDev[]>();
  for (const d of devices) {
    const key = d.bus.toLowerCase();
    (byBus.get(key) ?? byBus.set(key, []).get(key)!).push(d);
  }

  const result = new Map<string, UsbDev>();
  const cursor = new Map<string, number>();
  for (const name of names) {
    const lower = name.toLowerCase();
    // pick the longest bus description that the PC/SC name contains
    let bus = "";
    for (const key of byBus.keys()) {
      if (key && lower.includes(key) && key.length > bus.length) bus = key;
    }
    if (!bus) continue;
    const devs = byBus.get(bus)!;
    const i = cursor.get(bus) ?? 0;
    if (i < devs.length) {
      result.set(name, devs[i]);
      cursor.set(bus, i + 1);
    }
  }
  return result;
}

const stripGeneric = (name: string) => name.replace(/^Generic\s+/i, "").trim();

/** Build enriched details for the given PC/SC reader names. */
export async function getReaderDetails(names: string[]): Promise<ReaderDetail[]> {
  const devices = await queryUsbDevices();
  const map = correlate(names, devices);

  return names.map((name) => {
    const dev = map.get(name);
    const vid = dev?.vid?.toUpperCase() || null;
    const pid = dev?.pid?.toUpperCase() || null;
    const vendor = dev?.vid ? (USB_VENDORS[dev.vid.toLowerCase()] ?? null) : null;
    const usb = dev?.bus || null;

    const label = vendor
      ? `${vendor} · ${stripGeneric(name)}`
      : stripGeneric(name);

    return { name, vendor, vid, pid, usb, label };
  });
}
