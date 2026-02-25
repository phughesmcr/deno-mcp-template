import { createArrayValidator } from "$/shared/utils.ts";

export const validateOrigin = (origin: string): string => {
  const trimmedOrigin = origin.trim();

  // Allow wildcard
  if (trimmedOrigin === "*") return trimmedOrigin;
  if (!trimmedOrigin) {
    throw new Error(
      `Invalid origin: ${origin}. Must be a valid origin (e.g., https://example.com, http://localhost:3000, or *).`,
    );
  }

  const hasProtocol = /^https?:\/\//i.test(trimmedOrigin);
  const normalized = hasProtocol ? trimmedOrigin : `http://${trimmedOrigin}`;

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(normalized);
  } catch {
    throw new Error(
      `Invalid origin: ${origin}. Must be a valid origin (e.g., https://example.com, http://localhost:3000, or *).`,
    );
  }

  if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") {
    throw new Error(
      `Invalid origin: ${origin}. Must be a valid origin (e.g., https://example.com, http://localhost:3000, or *).`,
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
};

export const validateOrigins = createArrayValidator(validateOrigin);
