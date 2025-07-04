import type { Server } from "@modelcontextprotocol/sdk/server";
import { LOG_LEVEL, VALID_LOG_LEVELS } from "../constants.ts";
import { SetLevelRequestSchema } from "../schemas.ts";
import type { LogLevelKey, LogLevelValue, LogParams } from "../types.ts";

export class Logger {
  /** The current log level (lower is more severe) */
  #level: LogLevelValue;

  /** The MCP server */
  #server: Server;

  /** A simple MCP-safe logger, routing messages to STDERR to avoid STDIO bugs */
  constructor(server: Server, level: LogLevelKey = "info") {
    this.#server = server;
    this.#level = LOG_LEVEL[level];

    // Register handler for `logging/setLevel`
    server.setRequestHandler(
      SetLevelRequestSchema,
      async (request) => {
        const levelName = request.params.level;
        if (VALID_LOG_LEVELS.includes(levelName as LogLevelKey)) {
          this.setLoggingLevel(levelName as LogLevelKey);
        } else {
          this.error(`Invalid log level '${levelName}' received`);
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
  async setLoggingLevel(level: LogLevelKey) {
    this.#level = LOG_LEVEL[level];
    this.#server?.sendLoggingMessage({
      level: "info",
      data: {
        message: "Logging level set to " + level,
      },
    });
  }

  #log(level: LogLevelKey, args: LogParams): void {
    const msgs = args.map((arg) => typeof arg === "object" ? JSON.stringify(arg) : String(arg));
    const data = `[${level} - ${Date.now()}]: ${msgs.join(" ")}`;
    console.error(data);
    this.#server?.sendLoggingMessage({ level, data });
  }

  /** Detailed debugging information	(e.g., Function entry/exit points) */
  debug(...args: LogParams) {
    if (this.#level <= LOG_LEVEL.debug) {
      this.#log("debug", args);
    }
  }

  /** General informational messages (e.g., Operation progress updates) */
  info(...args: LogParams) {
    if (this.#level <= LOG_LEVEL.info) {
      this.#log("info", args);
    }
  }

  /** Normal but significant events	(e.g., Configuration changes) */
  notice(...args: LogParams) {
    if (this.#level <= LOG_LEVEL.notice) {
      this.#log("notice", args);
    }
  }

  /** Warning conditions (e.g. Deprecated feature usage) */
  warning(...args: LogParams) {
    if (this.#level <= LOG_LEVEL.warning) {
      this.#log("warning", args);
    }
  }

  /** Error conditions (e.g., Operation failures) */
  error(...args: LogParams) {
    if (this.#level <= LOG_LEVEL.error) {
      this.#log("error", args);
    }
  }

  /** Critical conditions (e.g., System component failures) */
  critical(...args: LogParams) {
    if (this.#level <= LOG_LEVEL.critical) {
      this.#log("critical", args);
    }
  }

  /** Action must be taken immediately (e.g., Data corruption detected) */
  alert(...args: LogParams) {
    if (this.#level <= LOG_LEVEL.alert) {
      this.#log("alert", args);
    }
  }

  /** System is unusable (e.g., Complete system failure) */
  emergency(...args: LogParams) {
    if (this.#level <= LOG_LEVEL.emergency) {
      this.#log("emergency", args);
    }
  }
}
