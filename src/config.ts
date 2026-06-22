/**
 * Central runtime configuration for the Thai ID Card Agent.
 *
 * Every value can be overridden with an environment variable so the same
 * binary works in dev, as a Windows Service, and inside an installer.
 */

export const VERSION = "1.1.0";

export const SERVICE_NAME = "ThaiIDCardAgent";

export const CONFIG = {
  /** Bind to loopback only - this agent must never be reachable from the LAN. */
  host: process.env.THAI_ID_AGENT_HOST ?? "127.0.0.1",
  port: Number(process.env.THAI_ID_AGENT_PORT ?? 9001),

  /**
   * CORS allow-list. A local card-reading agent is, by design, called from
   * arbitrary web apps running in the user's browser, so we allow all origins
   * by default. Restrict this (comma-separated origins) in hardened setups.
   */
  corsOrigin: process.env.THAI_ID_AGENT_CORS_ORIGIN ?? "*",

  /** Prefix every photo value with a data URI so it drops straight into <img src>. */
  photoAsDataUri: process.env.THAI_ID_AGENT_PHOTO_DATA_URI === "1",
} as const;
