import type { AppConfig, HttpServerConfig, LogLevelKey } from "$/types.ts";

function parseHosts(config: AppConfig) {
  const allowedHosts = [...new Set(config.allowedHosts)];
  return allowedHosts;
}

function parseOrigins(config: AppConfig) {
  // Build allowed origins once during initialization (performance optimization)
  const serverHttpOrigin = `http://${config.hostname}:${config.port}`;
  const serverHttpsOrigin = `https://${config.hostname}:${config.port}`;
  const allowedOrigins = [
    ...new Set([
      ...config.allowedOrigins,
      serverHttpOrigin,
      serverHttpsOrigin,
    ]),
  ];
  return allowedOrigins;
}

export class Config {
  readonly http: Readonly<HttpServerConfig & { enabled: boolean }>;
  readonly log: Readonly<{ level: LogLevelKey }>;
  readonly stdio: Readonly<{ enabled: boolean }>;

  constructor(config: AppConfig) {
    this.http = {
      enabled: !config.noHttp,
      hostname: config.hostname,
      port: config.port,
      headers: config.headers,
      allowedOrigins: parseOrigins(config),
      allowedHosts: parseHosts(config),
      noDnsRebinding: config.noDnsRebinding,
    };
    this.log = {
      level: config.log,
    };
    this.stdio = {
      enabled: !config.noStdio,
    };
  }
}
