import { createArrayValidator } from "$/shared/utils.ts";

const validateHeader = (header: string): string => {
  // RFC 7230 compliant header name pattern: letters, numbers, hyphens, underscores
  const headerNamePattern = /^[a-zA-Z0-9_-]+$/;
  // Header value pattern: printable ASCII characters (excluding control chars)
  const headerValuePattern = /^[\x20-\x7E]*$/;

  const colonIndex = header.indexOf(":");
  if (colonIndex === -1) {
    throw new Error(`Invalid header: ${header}. Must be in the format "key:value".`);
  }

  const key = header.substring(0, colonIndex).trim();
  const value = header.substring(colonIndex + 1).trim();

  if (!key || !headerNamePattern.test(key)) {
    throw new Error(
      `Invalid header name: ${key}. Must contain only letters, numbers, hyphens, and underscores.`,
    );
  }

  if (!headerValuePattern.test(value)) {
    throw new Error(
      `Invalid header value: ${value}. Must contain only printable ASCII characters.`,
    );
  }

  return `${key}:${value}`;
};

export const validateHeaders = createArrayValidator(validateHeader);
