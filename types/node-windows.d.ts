/**
 * Minimal type declarations for the subset of node-windows we use.
 * node-windows ships no types; this covers the Service API only.
 */
declare module "node-windows" {
  export interface ServiceEnvVar {
    name: string;
    value: string | number;
  }

  export interface ServiceOptions {
    name: string;
    description?: string;
    /** Absolute path to the entry script the service runs. */
    script: string;
    /** Executable used to run the script (defaults to process.execPath). */
    execPath?: string;
    workingDirectory?: string;
    env?: ServiceEnvVar | ServiceEnvVar[];
    nodeOptions?: string[];
    /** Seconds to wait before the first restart attempt. */
    wait?: number;
    /** Restart back-off growth factor (0..1). */
    grow?: number;
    maxRestarts?: number;
    maxRetries?: number;
  }

  export type ServiceEvent =
    | "install"
    | "alreadyinstalled"
    | "invalidinstallation"
    | "uninstall"
    | "alreadyuninstalled"
    | "start"
    | "stop"
    | "error";

  export class Service {
    constructor(options: ServiceOptions);
    install(): void;
    uninstall(): void;
    start(): void;
    stop(): void;
    on(event: ServiceEvent, listener: (...args: unknown[]) => void): this;
    readonly exists: boolean;
  }

  export class EventLogger {
    constructor(source?: string);
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  }
}
