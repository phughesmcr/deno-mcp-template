import type { Context, MiddlewareHandler, Next } from "hono";

import { HTTP_STATUS } from "$/shared/constants.ts";

function fixedLengthDigestEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
  const ua = new Uint8Array(a);
  const ub = new Uint8Array(b);
  if (ua.length !== ub.length) return false;
  let diff = 0;
  for (let i = 0; i < ua.length; i++) {
    diff |= ua[i]! ^ ub[i]!;
  }
  return diff === 0;
}

async function timingSafeTokenEqual(expected: string, supplied: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
    crypto.subtle.digest("SHA-256", enc.encode(supplied)),
  ]);
  return fixedLengthDigestEqual(a, b);
}

function extractBearer(authorization: string | undefined): string | undefined {
  if (!authorization) return undefined;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(authorization.trim());
  return m?.[1];
}

async function skipBearerAuth(_c: Context, next: Next): Promise<void> {
  await next();
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
    return skipBearerAuth;
  }

  return async (c: Context, next: Next) => {
    if (c.req.path.startsWith("/mcp-elicitation")) return await next();
    if (c.req.path !== "/mcp") return await next();
    if (c.req.method === "OPTIONS") return await next();

    const bearer = extractBearer(c.req.header("authorization"));
    const apiKey = c.req.header("x-api-key")?.trim();
    const bearerOk = bearer !== undefined && await timingSafeTokenEqual(token, bearer);
    const apiKeyOk = apiKey !== undefined && await timingSafeTokenEqual(token, apiKey);

    if (!bearerOk && !apiKeyOk) {
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
