/**
 * Owns the PC/SC client and the live registry of connected card readers.
 *
 * pcsc-mini is event-driven (it emits a `reader` event per device and
 * `change` events for card insert/remove) rather than offering a synchronous
 * "list readers" call, so we maintain our own registry that the HTTP layer
 * can query. pcsc-mini is imported lazily so that a missing/broken native
 * binary degrades to a clear API error instead of crashing the whole agent.
 */

import { AgentError } from "./errors";
import { readThaiIdCard, type ThaiIdCardData } from "./thai-id-parser";

// Loaded lazily in start(); typed loosely to avoid a hard dependency at import.
type Pcsc = typeof import("pcsc-mini");
type Reader = import("pcsc-mini").Reader;
type Card = import("pcsc-mini").Card;

interface ReaderEntry {
  reader: Reader;
  name: string;
  present: boolean;
}

export class ReaderManager {
  private pcsc: Pcsc | null = null;
  private client: import("pcsc-mini").Client | null = null;
  private readonly readers = new Map<string, ReaderEntry>();
  /** Per-reader promise chain so concurrent /data calls don't collide. */
  private readonly locks = new Map<string, Promise<unknown>>();

  /** Watchdog timer that re-arms reader detection (see below). */
  private rescan: ReturnType<typeof setInterval> | null = null;
  private refreshing = false;
  private stopped = false;

  /**
   * How often (ms) to recreate the PC/SC client while NO reader is connected.
   * PC/SC monitoring can stop detecting newly-plugged readers once the last
   * reader is removed (the classic "zero reader" PnP problem) - a fresh client
   * re-arms detection so re-plugging a reader is noticed again.
   */
  private static readonly RESCAN_MS = 2500;

  /** Human-readable reason the PC/SC subsystem is unavailable, if any. */
  loadError: string | null = null;

  /** Load the native binding and begin monitoring readers. Never throws. */
  async start(): Promise<void> {
    try {
      this.pcsc = await import("pcsc-mini");
    } catch (err) {
      this.loadError =
        "ไม่สามารถโหลด native module 'pcsc-mini' ได้ - ตรวจสอบว่าได้ติดตั้ง dependency แล้ว " +
        "และเครื่องเป็น Windows x64 (ดูหัวข้อ Troubleshooting ใน README). " +
        `รายละเอียด: ${String(err)}`;
      console.error("[pcsc] " + this.loadError);
      return;
    }

    this.stopped = false;
    this.startClient();

    // Watchdog: while there are zero readers, periodically rebuild the client
    // so a reader plugged back in (after all were removed) is detected again.
    this.rescan = setInterval(() => this.tick(), ReaderManager.RESCAN_MS);
  }

  /** (Re)create the PC/SC monitoring client. */
  private startClient(): void {
    if (!this.pcsc || this.stopped) return;
    try {
      this.client = new this.pcsc.Client()
        .on("reader", (reader) => this.onReader(reader))
        .on("error", (err) => {
          console.error("[pcsc] client error:", err);
          // Monitoring may be dead - rebuild if nothing is connected.
          this.refreshIfIdle();
        })
        .start();
      console.log("[pcsc] monitoring smart card readers...");
    } catch (err) {
      console.error("[pcsc] ไม่สามารถเริ่ม PC/SC client:", err);
      this.client = null; // next watchdog tick retries
    }
  }

  private tick(): void {
    if (this.stopped) return;
    // Only rebuild when idle so active card reads are never interrupted.
    if (this.readers.size === 0) this.refreshIfIdle();
  }

  /** Tear down the current client and start a fresh one (idle only). */
  private refreshIfIdle(): void {
    if (this.refreshing || this.stopped || this.readers.size > 0) return;
    this.refreshing = true;
    try {
      const old = this.client;
      this.client = null;
      try {
        old?.removeAllListeners();
        old?.stop();
      } catch {
        /* ignore teardown errors */
      }
      this.startClient();
    } finally {
      this.refreshing = false;
    }
  }

  /** Stop monitoring and release the PC/SC context. */
  stop(): void {
    this.stopped = true;
    if (this.rescan) {
      clearInterval(this.rescan);
      this.rescan = null;
    }
    try {
      this.client?.removeAllListeners();
      this.client?.stop();
    } catch {
      /* ignore */
    }
    this.client = null;
    this.readers.clear();
  }

  private onReader(reader: Reader): void {
    // reader.name() is a method (it may disambiguate same-model readers);
    // capture it once so registry keys stay stable for this reader instance.
    const name = reader.name();
    const entry: ReaderEntry = { reader, name, present: false };
    this.readers.set(name, entry);
    console.log(`[pcsc] reader connected: ${name}`);

    reader.on("change", (status) => {
      const ReaderStatus = this.pcsc!.ReaderStatus;
      entry.present = status.has(ReaderStatus.PRESENT);
    });

    reader.on("disconnect", () => {
      this.readers.delete(name);
      console.log(`[pcsc] reader disconnected: ${name}`);
    });
  }

  /** Names of all currently connected readers (what GET /readers returns). */
  listReaders(): string[] {
    return [...this.readers.keys()];
  }

  /** Whether a card is currently reported present in the named reader. */
  hasCard(readerName: string): boolean {
    return this.readers.get(readerName)?.present ?? false;
  }

  /**
   * Read the card in the named reader. Reads on the same reader are
   * serialized; different readers run in parallel.
   */
  async readData(readerName: string): Promise<ThaiIdCardData> {
    if (this.loadError) throw new AgentError(503, this.loadError);

    const entry = this.readers.get(readerName);
    if (!entry) {
      throw new AgentError(
        404,
        `ไม่พบเครื่องอ่านชื่อ "${readerName}" (เรียก GET /readers เพื่อดูรายชื่อที่เชื่อมต่ออยู่)`,
      );
    }

    const previous = this.locks.get(readerName) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(() => this.doRead(entry));
    this.locks.set(readerName, run);
    try {
      return await run;
    } finally {
      if (this.locks.get(readerName) === run) this.locks.delete(readerName);
    }
  }

  private async doRead(entry: ReaderEntry): Promise<ThaiIdCardData> {
    const { CardMode, CardDisposition } = this.pcsc!;

    let card: Card;
    try {
      card = await entry.reader.connect(CardMode.SHARED);
    } catch (err) {
      throw new AgentError(
        409,
        `ไม่พบบัตร หรือเชื่อมต่อบัตรไม่ได้ในเครื่องอ่าน "${entry.name}" ` +
          `- กรุณาเสียบบัตรให้แน่นแล้วลองใหม่ (${String(err)})`,
      );
    }

    try {
      return await readThaiIdCard(card);
    } catch (err) {
      throw new AgentError(
        500,
        `อ่านข้อมูลบัตรไม่สำเร็จ: ${String(err)}`,
      );
    } finally {
      try {
        await card.disconnect(CardDisposition.LEAVE);
      } catch {
        /* best effort */
      }
    }
  }
}
