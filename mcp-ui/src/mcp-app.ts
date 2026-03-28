/**
 * MCP App view for fetch-website-info (vanilla + @modelcontextprotocol/ext-apps).
 */
import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import "./mcp-app.css";

const argUrlEl = document.getElementById("arg-url") as HTMLElement;
const resultPanel = document.getElementById("result-panel") as HTMLElement;
const errorPanel = document.getElementById("error-panel") as HTMLElement;
const errorTextEl = document.getElementById("error-text") as HTMLElement;
const resultMetaEl = document.getElementById("result-meta") as HTMLElement;
const headersBody = document.querySelector(
  "#headers-table tbody",
) as HTMLTableSectionElement;

function applySafeArea(ctx: McpUiHostContext): void {
  if (!ctx.safeAreaInsets) return;
  const { top, right, bottom, left } = ctx.safeAreaInsets;
  document.body.style.padding = `${top}px ${right}px ${bottom}px ${left}px`;
}

function onHostContextChanged(ctx: McpUiHostContext): void {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
  applySafeArea(ctx);
}

type SuccessPayload = {
  url?: string;
  status?: number;
  statusText?: string;
  redirected?: boolean;
  headers?: Record<string, string>;
  timestamp?: string;
};

function displayField(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return typeof value === "string" ? value : String(value);
}

function textFromResultContent(result: CallToolResult): string | undefined {
  const block = result.content?.find(function isTextBlock(c): boolean {
    return c.type === "text";
  });
  if (block && "text" in block) return String(block.text);
  return undefined;
}

/** When `structuredContent` or JSON text includes a string `url`, treat as success payload. */
function asRenderableSuccessPayload(
  value: unknown,
): SuccessPayload | undefined {
  if (!value || typeof value !== "object") return undefined;
  const o = value as SuccessPayload;
  if (typeof o.url !== "string") return undefined;
  return o;
}

function renderArgs(args: Record<string, unknown> | undefined): void {
  const url = typeof args?.url === "string" ? args.url : "—";
  argUrlEl.textContent = url;
}

function clearPanels(): void {
  resultPanel.hidden = true;
  errorPanel.hidden = true;
  resultMetaEl.replaceChildren();
  headersBody.replaceChildren();
}

function renderSuccess(data: SuccessPayload): void {
  clearPanels();
  resultPanel.hidden = false;

  const rows: [string, string][] = [
    ["URL", displayField(data.url)],
    ["Status", displayField(data.status)],
    ["Status text", displayField(data.statusText)],
    ["Redirected", displayField(data.redirected)],
    ["Timestamp", displayField(data.timestamp)],
  ];

  for (const [dt, dd] of rows) {
    const dEl = document.createElement("dt");
    dEl.textContent = dt;
    const ddEl = document.createElement("dd");
    ddEl.textContent = dd;
    resultMetaEl.append(dEl, ddEl);
  }

  const headers = data.headers ?? {};
  for (const [name, value] of Object.entries(headers)) {
    const tr = document.createElement("tr");
    const tdName = document.createElement("td");
    tdName.textContent = name;
    const tdVal = document.createElement("td");
    tdVal.textContent = value;
    tdVal.className = "mono";
    tr.append(tdName, tdVal);
    headersBody.append(tr);
  }
}

function renderErrorFromResult(result: CallToolResult): void {
  clearPanels();
  errorPanel.hidden = false;
  errorTextEl.textContent = textFromResultContent(result) ??
    JSON.stringify(result);
}

function renderFromToolResult(result: CallToolResult): void {
  if (result.isError) {
    renderErrorFromResult(result);
    return;
  }
  const fromStructured = asRenderableSuccessPayload(result.structuredContent);
  if (fromStructured) {
    renderSuccess(fromStructured);
    return;
  }
  const text = textFromResultContent(result);
  if (text !== undefined) {
    try {
      const fromParsed = asRenderableSuccessPayload(
        JSON.parse(text) as unknown,
      );
      if (fromParsed) {
        renderSuccess(fromParsed);
        return;
      }
    } catch {
      // Not JSON; fall through to error panel.
    }
  }
  renderErrorFromResult(result);
}

const app = new App({ name: "Website info", version: "1.0.0" });

async function onTeardown(): Promise<Record<string, never>> {
  return {};
}

function onToolInput(params: { arguments?: unknown }): void {
  renderArgs(params.arguments as Record<string, unknown> | undefined);
}

function onToolResult(result: CallToolResult): void {
  renderFromToolResult(result);
}

app.onteardown = onTeardown;
app.ontoolinput = onToolInput;
app.ontoolresult = onToolResult;
app.onhostcontextchanged = onHostContextChanged;

void (async () => {
  await app.connect();
  const ctx = app.getHostContext();
  if (ctx) onHostContextChanged(ctx);
})();
