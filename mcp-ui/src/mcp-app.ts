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
    ["URL", data.url ?? "—"],
    ["Status", data.status != null ? String(data.status) : "—"],
    ["Status text", data.statusText ?? "—"],
    ["Redirected", data.redirected != null ? String(data.redirected) : "—"],
    ["Timestamp", data.timestamp ?? "—"],
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
  const textBlock = result.content?.find((c) => c.type === "text");
  const text = textBlock && "text" in textBlock
    ? String(textBlock.text)
    : JSON.stringify(result);
  errorTextEl.textContent = text;
}

function renderFromToolResult(result: CallToolResult): void {
  if (result.isError) {
    renderErrorFromResult(result);
    return;
  }
  const structured = result.structuredContent as SuccessPayload | undefined;
  if (structured && typeof structured.url === "string") {
    renderSuccess(structured);
    return;
  }
  const textBlock = result.content?.find((c) => c.type === "text");
  if (textBlock && "text" in textBlock) {
    try {
      const parsed = JSON.parse(textBlock.text) as SuccessPayload;
      if (parsed && typeof parsed.url === "string") {
        renderSuccess(parsed);
        return;
      }
    } catch {
      /* fall through */
    }
  }
  renderErrorFromResult(result);
}

const app = new App({ name: "Website info", version: "1.0.0" });

app.onteardown = async () => ({});

app.ontoolinput = (params) => {
  renderArgs(params.arguments as Record<string, unknown> | undefined);
};

app.ontoolresult = (result) => {
  renderFromToolResult(result);
};

app.onhostcontextchanged = onHostContextChanged;

void (async () => {
  await app.connect();
  const ctx = app.getHostContext();
  if (ctx) onHostContextChanged(ctx);
})();
