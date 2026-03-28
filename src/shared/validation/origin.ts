import { createArrayValidator } from "$/shared/utils.ts";

export function validateOrigin(origin: string): string {
  const trimmedOrigin = origin.trim();

  if (!trimmedOrigin) {
    throw new Error(
      `Invalid origin: ${origin}. Must be a valid origin (e.g., https://example.com or http://localhost:3000).`,
    );
  }

  if (trimmedOrigin === "*") {
    throw new Error(
      `Invalid origin: wildcard "*" is not allowed; list each allowed origin explicitly.`,
    );
  }

  const hasProtocol = /^https?:\/\//i.test(trimmedOrigin);
  const normalized = hasProtocol ? trimmedOrigin : `http://${trimmedOrigin}`;

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(normalized);
  } catch {
    throw new Error(
      `Invalid origin: ${origin}. Must be a valid origin (e.g., https://example.com or http://localhost:3000).`,
    );
  }

  if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") {
    throw new Error(
      `Invalid origin: ${origin}. Must be a valid origin (e.g., https://example.com or http://localhost:3000).`,
    );
  }

  if (
    parsedOrigin.username || parsedOrigin.password || parsedOrigin.pathname !== "/" ||
    parsedOrigin.search || parsedOrigin.hash
  ) {
    throw new Error(
      `Invalid origin: ${origin}. Must not include paths, query params, or fragments.`,
    );
  }

  return parsedOrigin.origin;
}

export const validateOrigins = createArrayValidator(validateOrigin);
