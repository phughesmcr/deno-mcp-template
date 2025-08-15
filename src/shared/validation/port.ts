import { createValidator } from "$/shared/utils.ts";

export const validatePort = createValidator(
  (port: number) => Number.isInteger(port) && port >= 1 && port <= 65535,
  (port) => `Invalid port: ${port}. Must be between 1 and 65535.`,
);
