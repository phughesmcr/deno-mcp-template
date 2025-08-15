import { createArrayValidator } from "$/shared/utils.ts";

export const validateOrigin = (origin: string): string => {
  // Regex to validate server origins (protocol://hostname:port)
  const pattern =
    /^(?:\*|(?:https?:\/\/)?(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?|localhost|(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?))(?::[1-9][0-9]{0,4})?)$/;

  const trimmedOrigin = origin.trim();

  // Allow wildcard
  if (trimmedOrigin === "*") return trimmedOrigin;

  // If no protocol, assume http://
  const originWithProtocol =
    trimmedOrigin.startsWith("http://") || trimmedOrigin.startsWith("https://") ?
      trimmedOrigin :
      `http://${trimmedOrigin}`;

  if (pattern.test(originWithProtocol)) return trimmedOrigin;

  throw new Error(
    `Invalid origin: ${origin}. Must be a valid origin (e.g., https://example.com, http://localhost:3000, or *).`,
  );
};

export const validateOrigins = createArrayValidator(validateOrigin);
