import type { Server } from "@modelcontextprotocol/sdk/server";

import { APP_NAME, LOG_LEVEL, VALID_LOG_LEVELS } from "../constants.ts";
import { SetLevelRequestSchema } from "../schemas.ts";
import type { LogData, LogLevelKey, LogLevelValue } from "../types.ts";

export class Logger {
  /** The current log level (lower is more severe) */
  #level: LogLevelValue;

  /** The MCP server */
  #server: Server;

  /** A simple MCP-safe logger, routing messages to stderr to avoid STDIO bugs */
  constructor(server: Server, level: LogLevelKey = "info") {
    this.#level = LOG_LEVEL[level];
    this.#server = server;

    // Register handler for `logging/setLevel`
    server.setRequestHandler(
      SetLevelRequestSchema,
      async (request) => {
        const levelName = request.params.level.trim().toLowerCase();
        if (VALID_LOG_LEVELS.includes(levelName as LogLevelKey)) {
          this.setLoggingLevel(levelName as LogLevelKey);
        } else {
          this.error({
            data: {
              error: `Invalid log level "${levelName}" received.`,
            },
          });
        }
        return {};
      },
    );
  }

  /** The current log level (lower is more severe) */
  get level() {
    return this.#level;
  }

  /** Sets the log level */
  async setLoggingLevel(level: LogLevelKey): Promise<void> {
    this.#level = LOG_LEVEL[level];
    return this.#server.sendLoggingMessage({
      level: "info",
      data: {
        message: "Logging level set to " + level,
      },
    }).catch((error) => {
      this.error({
        data: {
          error: `Failed to send logging message: ${
            error instanceof Error ? error.message : String(error)
          }`,
          details: error,
        },
      });
    });
  }

  /** Notify the server and print to stderr */
  #log(level: LogLevelKey, log: LogData | string): void {
    const logData: LogData = typeof log === "string" ? { data: { [level]: log } } : log;
    const { logger = APP_NAME, data } = logData;
    this.#server.sendLoggingMessage({ level, data, logger }).catch((error) => {
      const notConnected = error instanceof Error && error.message.includes("Not connected");
      if (!notConnected) {
        console.error("Failed to send logging message:", error);
      }
    });
  }

  /** Log channel for detailed debugging information (e.g., Function entry/exit points) */
  debug(data: LogData | string) {
    if (this.#level <= LOG_LEVEL.debug) {
      this.#log("debug", data);
    }
  }

  /** Log channel for general informational messages (e.g., Operation progress updates) */
  info(data: LogData | string) {
    if (this.#level <= LOG_LEVEL.info) {
      this.#log("info", data);
    }
  }

  /** Log channel for normal but significant events	(e.g., Configuration changes) */
  notice(data: LogData | string) {
    if (this.#level <= LOG_LEVEL.notice) {
      this.#log("notice", data);
    }
  }

  /** Log channel for warning conditions (e.g. Deprecated feature usage) */
  warning(data: LogData | string) {
    if (this.#level <= LOG_LEVEL.warning) {
      this.#log("warning", data);
    }
  }

  /** Log channel for error conditions (e.g., Operation failures) */
  error(data: LogData | string) {
    if (this.#level <= LOG_LEVEL.error) {
      this.#log("error", data);
    }
  }

  /** Log channel for critical conditions (e.g., System component failures) */
  critical(data: LogData | string) {
    if (this.#level <= LOG_LEVEL.critical) {
      this.#log("critical", data);
    }
  }

  /** Log channel for action must be taken immediately (e.g., Data corruption detected) */
  alert(data: LogData | string) {
    if (this.#level <= LOG_LEVEL.alert) {
      this.#log("alert", data);
    }
  }

  /** Log channel for when the system is unusable (e.g., Complete system failure) */
  emergency(data: LogData | string) {
    if (this.#level <= LOG_LEVEL.emergency) {
      this.#log("emergency", data);
    }
  }
}
