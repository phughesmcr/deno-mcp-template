import type { AppConfig } from "$/types.ts";
import { DEFAULT_LOG_LEVEL } from "./app.ts";
import { ALLOWED_HOSTS, ALLOWED_ORIGINS, DEFAULT_HOSTNAME, DEFAULT_PORT, HEADERS } from "./http.ts";

export const DEFAULT_CONFIG: Readonly<AppConfig> = {
  hostname: DEFAULT_HOSTNAME,
  port: DEFAULT_PORT,
  log: DEFAULT_LOG_LEVEL,
  headers: HEADERS,
  allowedOrigins: ALLOWED_ORIGINS,
  allowedHosts: ALLOWED_HOSTS,
  noDnsRebinding: false,
  noHttp: false,
  noStdio: false,
  help: false,
  version: false,
};
