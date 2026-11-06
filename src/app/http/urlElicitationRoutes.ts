/**
 * Browser routes for URL-mode MCP elicitation (confirm / cancel in-page).
 * @module
 */

import type { Env, Hono } from "hono";

import type { KvRuntime } from "$/kv/runtime.ts";
import {
  getUrlElicitation,
  resolveUrlElicitation,
  type UrlElicitationRecord,
} from "$/mcp/urlElicitation/store.ts";
import { isUUID } from "$/shared/validation.ts";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

function errorPage(message: string): string {
  return `<!DOCTYPE html><html><body><p>${escapeHtml(message)}</p></body></html>`;
}

type ElicitationGateResult =
  | { ok: true; elicitation: string; record: UrlElicitationRecord }
  | { ok: false; page: string };

async function gatePendingElicitation(
  kv: Deno.Kv,
  elicitation: string,
): Promise<ElicitationGateResult> {
  if (!isUUID(elicitation)) {
    return { ok: false, page: errorPage("Invalid parameters.") };
  }
  const record = await getUrlElicitation(kv, elicitation);
  if (record?.status !== "pending") {
    return { ok: false, page: errorPage("Unknown or expired elicitation.") };
  }
  return { ok: true, elicitation, record };
}

export function registerUrlElicitationRoutes<E extends Env>(
  app: Hono<E>,
  kvRuntime: KvRuntime,
): void {
  app.get("/mcp-elicitation/confirm", async function (c) {
    const kv = await kvRuntime.get();
    const elicitation = c.req.query("elicitation")?.trim() ?? "";
    const gate = await gatePendingElicitation(kv, elicitation);
    if (!gate.ok) {
      return c.html(gate.page, 400);
    }

    const labelHtml = escapeHtml(gate.record.label);
    const elicitationAttr = escapeAttr(gate.elicitation);

    return c.html(
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Confirm action</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 28rem; margin: 2rem auto; padding: 0 1rem; }
    p.label { background: #f4f4f5; padding: 0.75rem 1rem; border-radius: 6px; }
    form { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1rem; }
    button { padding: 0.5rem 1rem; border-radius: 6px; border: none; cursor: pointer; font-size: 1rem; }
    button.confirm { background: #16a34a; color: white; }
    button.cancel { background: #71717a; color: white; }
  </style>
</head>
<body>
  <h1>Confirm demo action</h1>
  <p class="label">${labelHtml}</p>
  <form method="post" action="/mcp-elicitation/confirm">
    <input type="hidden" name="elicitation" value="${elicitationAttr}"/>
    <button type="submit" name="action" value="confirm" class="confirm">Confirm</button>
    <button type="submit" name="action" value="cancel" class="cancel">Cancel</button>
  </form>
  <p style="color:#71717a;font-size:0.875rem;margin-top:1.5rem">You can close this tab after submitting.</p>
</body>
</html>`,
    );
  });

  /** Records the outcome; the client reads it from KV when it retries the tool call. */
  app.post("/mcp-elicitation/confirm", async function (c) {
    let body: Record<string, string>;
    try {
      body = await c.req.parseBody() as Record<string, string>;
    } catch {
      return c.html(errorPage("Invalid form body."), 400);
    }

    const elicitation = typeof body.elicitation === "string" ? body.elicitation.trim() : "";
    const action = typeof body.action === "string" ? body.action.trim() : "";

    if (action !== "confirm" && action !== "cancel") {
      return c.html(errorPage("Invalid action."), 400);
    }

    const kv = await kvRuntime.get();
    const status = action === "confirm" ? "confirmed" : "cancelled";
    if (!isUUID(elicitation) || !await resolveUrlElicitation(kv, elicitation, status)) {
      return c.html(errorPage("Unknown or expired elicitation."), 400);
    }

    let outcome: { title: string; message: string; bannerClass: string };
    if (action === "confirm") {
      outcome = {
        title: "Confirmed",
        message:
          "The demo action was confirmed. You can close this tab and return to your MCP client.",
        bannerClass: "ok",
      };
    } else {
      outcome = {
        title: "Cancelled",
        message:
          "The demo action was cancelled. You can close this tab and return to your MCP client.",
        bannerClass: "info",
      };
    }

    return c.html(
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(outcome.title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 28rem; margin: 2rem auto; padding: 0 1rem; text-align: center; }
    .banner { padding: 1rem; border-radius: 8px; margin: 1rem 0; }
    .ok { background: #dcfce7; color: #166534; }
    .info { background: #e4e4e7; color: #3f3f46; }
  </style>
</head>
<body>
  <h1>${escapeHtml(outcome.title)}</h1>
  <div class="banner ${outcome.bannerClass}">${escapeHtml(outcome.message)}</div>
</body>
</html>`,
    );
  });
}
