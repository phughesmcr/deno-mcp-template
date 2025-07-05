import type { Server } from "@modelcontextprotocol/sdk/server";

import { APP_NAME, LOG_LEVEL, VALID_LOG_LEVELS } from "../constants.ts";
import { SetLevelRequestSchema } from "../schemas.ts";
import type { LogData, LogLevelKey, LogLevelValue } from "../types.ts";
import { setGlobal } from "../utils.ts";

export class Logger {
  /** The current log level (lower is more severe) */
  #level: LogLevelValue;

  /** Whether to suppress logging to stderr (but not the MCP server logs) */
  #quiet: boolean;

  /** The MCP server */
  #server: Server;

  /** A simple MCP-safe logger, routing messages to stderr to avoid STDIO bugs */
  constructor(server: Server, level: LogLevelKey = "info", quiet = false) {
    this.#level = LOG_LEVEL[level];
    this.#quiet = quiet;
    this.#server = server;

    // Set the quiet flag in the global scope
    setGlobal("QUIET", quiet);

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

  /** Whether logs to stderr are suppressed (but not the MCP server logs) */
  get quiet() {
    return this.#quiet;
  }

  /** Sets the log level */
  async setLoggingLevel(level: LogLevelKey): Promise<void> {
    this.#level = LOG_LEVEL[level];
    await this.#server.sendLoggingMessage({
      level: "info",
      data: {
        message: "Logging level set to " + level,
      },
    });
  }

  /** Transforms object values to strings for logging */
  #transformLogData(data: Record<string, unknown>): Record<string, string> {
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) => [
        k,
        typeof v === "object" ? JSON.stringify(v) : String(v),
      ]),
    );
  }

  /** Notify the server and print to stderr */
  #log(level: LogLevelKey, log: LogData | string): void {
    const logData: LogData = typeof log === "string" ? { data: { message: log } } : log;
    const { logger = APP_NAME, data } = logData;
    const transformedData = this.#transformLogData(data);

    // notify server
    try {
      this.#server.sendLoggingMessage({ level, data, logger });
    } catch (error) {
      if (!this.#quiet) {
        console.error("Failed to send logging message:", error);
      }
    }

    // print to stderr
    if (!this.#quiet) {
      const timestamp = new Date().toISOString();
      const msg = `[${level} (${logger}) ${timestamp}]: ${JSON.stringify(transformedData)}`;
      console.error(msg);
    }
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
