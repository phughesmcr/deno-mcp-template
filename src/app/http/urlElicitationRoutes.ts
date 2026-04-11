/**
 * Browser routes for URL-mode MCP elicitation (confirm / cancel in-page).
 * @module
 */

import type { Env, Hono } from "hono";

import type {
  UrlElicitationRecord,
  UrlElicitationRegistry,
} from "$/mcp/urlElicitation/registry.ts";
import { isUUID } from "$/shared/validation.ts";

import type { HTTPTransportManager } from "./transport.ts";

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
  | { ok: true; session: string; elicitation: string; record: UrlElicitationRecord }
  | { ok: false; page: string };

function gatePendingElicitation(
  registry: UrlElicitationRegistry,
  transports: HTTPTransportManager,
  session: string,
  elicitation: string,
): ElicitationGateResult {
  if (!isUUID(session) || !isUUID(elicitation)) {
    return { ok: false, page: errorPage("Invalid parameters.") };
  }
  if (!transports.get(session)) {
    return { ok: false, page: errorPage("Unknown or expired MCP session.") };
  }
  const record = registry.getPendingForSession(elicitation, session);
  if (!record) {
    return { ok: false, page: errorPage("Unknown or expired elicitation.") };
  }
  return { ok: true, session, elicitation, record };
}

export function registerUrlElicitationRoutes<E extends Env>(
  app: Hono<E>,
  deps: { registry: UrlElicitationRegistry; transports: HTTPTransportManager },
): void {
  const { registry, transports } = deps;

  app.get("/mcp-elicitation/confirm", function (c) {
    const session = c.req.query("session")?.trim() ?? "";
    const elicitation = c.req.query("elicitation")?.trim() ?? "";
    const gate = gatePendingElicitation(registry, transports, session, elicitation);
    if (!gate.ok) {
      return c.html(gate.page, 400);
    }

    const labelHtml = escapeHtml(gate.record.label);
    const sessionAttr = escapeAttr(gate.session);
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
    <input type="hidden" name="session" value="${sessionAttr}"/>
    <input type="hidden" name="elicitation" value="${elicitationAttr}"/>
    <button type="submit" name="action" value="confirm" class="confirm">Confirm</button>
    <button type="submit" name="action" value="cancel" class="cancel">Cancel</button>
  </form>
  <p style="color:#71717a;font-size:0.875rem;margin-top:1.5rem">You can close this tab after submitting.</p>
</body>
</html>`,
    );
  });

  /**
   * Confirm and cancel both complete the elicitation and invoke the SDK completion notifier once.
   * The HTML response differs; clients that need distinct outcomes should extend the flow (if the
   * SDK adds structured completion payloads) or use a different elicitation mode.
   */
  app.post("/mcp-elicitation/confirm", async function (c) {
    let body: Record<string, string>;
    try {
      body = await c.req.parseBody() as Record<string, string>;
    } catch {
      return c.html(errorPage("Invalid form body."), 400);
    }

    const session = typeof body.session === "string" ? body.session.trim() : "";
    const elicitation = typeof body.elicitation === "string" ? body.elicitation.trim() : "";
    const action = typeof body.action === "string" ? body.action.trim() : "";

    if (action !== "confirm" && action !== "cancel") {
      return c.html(errorPage("Invalid action."), 400);
    }

    const gate = gatePendingElicitation(registry, transports, session, elicitation);
    if (!gate.ok) {
      return c.html(gate.page, 400);
    }

    await registry.complete(gate.elicitation);

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
