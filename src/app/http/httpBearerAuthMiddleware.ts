import type { Context, MiddlewareHandler, Next } from "hono";

import { HTTP_STATUS } from "$/shared/constants.ts";

function timingSafeStringEqual(expected: string, supplied: string): boolean {
  if (expected.length !== supplied.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  }
  return diff === 0;
}

function extractBearer(authorization: string | undefined): string | undefined {
  if (!authorization) return undefined;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(authorization.trim());
  return m?.[1];
}

/**
 * When a bearer token is configured, requires `Authorization: Bearer <token>` or matching `x-api-key`
 * for `/mcp` requests. Skips `OPTIONS` so CORS preflight succeeds.
 */
export function createHttpBearerAuthMiddleware(
  bearerToken: string | undefined,
): MiddlewareHandler {
  const token = bearerToken?.trim();
  if (!token) {
    return async (_c, next) => await next();
  }

  return async (c: Context, next: Next) => {
    if (c.req.path.startsWith("/mcp-elicitation")) return await next();
    if (c.req.path !== "/mcp") return await next();
    if (c.req.method === "OPTIONS") return await next();

    const bearer = extractBearer(c.req.header("authorization"));
    const apiKey = c.req.header("x-api-key")?.trim();
    const ok = (bearer !== undefined && timingSafeStringEqual(token, bearer)) ||
      (apiKey !== undefined && timingSafeStringEqual(token, apiKey));

    if (!ok) {
      return c.json(
        {
          error: "unauthorized",
          message: "Invalid or missing credentials",
        },
        HTTP_STATUS.UNAUTHORIZED,
      );
    }
    return await next();
  };
}
