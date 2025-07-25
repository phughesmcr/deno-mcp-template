import type { Server } from "@modelcontextprotocol/sdk/server";
import {
  type LoggingMessageNotification,
  SetLevelRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { APP_NAME, DEFAULT_LOG_LEVEL, LOG_LEVEL, VALID_LOG_LEVELS } from "$/shared/constants.ts";
import type { LogLevelKey } from "$/shared/types.ts";

export type LogLevelValue = typeof LOG_LEVEL[LogLevelKey];

export type LogMessageParams = LoggingMessageNotification["params"];

export type LogParams = Omit<LogMessageParams, "level"> & { logger?: string };

export class Logger {
  /** The MCP server instance */
  #mcp: Server;

  /** The current log level */
  #level: LogLevelKey;

  /** The current log level severity (lower (0) is more severe) */
  #severity: LogLevelValue;

  /** Log channel for detailed debugging information (e.g., Function entry/exit points) */
  debug: (data: LogParams) => void;

  /** Log channel for general informational messages (e.g., Operation progress updates) */
  info: (data: LogParams) => void;

  /** Log channel for normal but significant events	(e.g., Configuration changes) */
  notice: (data: LogParams) => void;

  /** Log channel for warning conditions (e.g. Deprecated feature usage) */
  warning: (data: LogParams) => void;

  /** Log channel for error conditions (e.g., Operation failures) */
  error: (data: LogParams) => void;

  /** Log channel for critical conditions (e.g., System component failures) */
  critical: (data: LogParams) => void;

  /** Log channel for action must be taken immediately (e.g., Data corruption detected) */
  alert: (data: LogParams) => void;

  /** Log channel for when the system is unusable (e.g., Complete system failure) */
  emergency: (data: LogParams) => void;

  constructor(mcp: Server, level: LogLevelKey = DEFAULT_LOG_LEVEL) {
    this.#mcp = mcp;
    this.#level = level;
    this.#severity = LOG_LEVEL[level];

    this.debug = (data: LogParams) => this.#log("debug", data);
    this.info = (data: LogParams) => this.#log("info", data);
    this.notice = (data: LogParams) => this.#log("notice", data);
    this.warning = (data: LogParams) => this.#log("warning", data);
    this.error = (data: LogParams) => this.#log("error", data);
    this.critical = (data: LogParams) => this.#log("critical", data);
    this.alert = (data: LogParams) => this.#log("alert", data);
    this.emergency = (data: LogParams) => this.#log("emergency", data);

    // Register handler for `logging/setLevel`
    mcp.setRequestHandler(
      SetLevelRequestSchema,
      async (request) => {
        const levelName = request.params.level.trim().toLowerCase() as LogLevelKey;
        if (VALID_LOG_LEVELS.includes(levelName)) {
          this.#level = levelName;
          this.#severity = LOG_LEVEL[levelName];
        }
        return {};
      },
    );
  }

  get level() {
    return this.#level;
  }

  get severity() {
    return this.#severity;
  }

  async #log(logLevel: LogLevelKey, data: LogParams): Promise<void> {
    if (this.#severity < LOG_LEVEL[logLevel]) {
      return;
    }
    const result: LogMessageParams = {
      ...data,
      level: logLevel,
      logger: data.logger ?? APP_NAME,
    };
    try {
      await this.#mcp.sendLoggingMessage(result);
    } catch (error) {
      const notConnected = error instanceof Error && error.message.includes("Not connected");
      if (!notConnected) {
        console.error({
          level: "error",
          logger: APP_NAME,
          data: {
            error: "Failed to send logging message",
            details: error,
          },
        });
      }
    }
  }
}
