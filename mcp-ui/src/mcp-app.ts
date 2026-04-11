/**
 * MCP App view for fetch-website-info (vanilla + @modelcontextprotocol/ext-apps).
 */
import {
  App,
  type AppEventMap,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import type {
  CallToolResult,
  ContentBlock,
} from "@modelcontextprotocol/sdk/types.js";

import "./mcp-app.css";

const argUrlEl = document.getElementById("arg-url") as HTMLElement;
const resultPanel = document.getElementById("result-panel") as HTMLElement;
const errorPanel = document.getElementById("error-panel") as HTMLElement;
const errorTextEl = document.getElementById("error-text") as HTMLElement;
const cancelPanel = document.getElementById("cancel-panel") as HTMLElement;
const cancelTextEl = document.getElementById("cancel-text") as HTMLElement;
const resultMetaEl = document.getElementById("result-meta") as HTMLElement;
const headersBody = document.querySelector(
  "#headers-table tbody",
) as HTMLTableSectionElement;
const btnDownload = document.getElementById(
  "btn-download",
) as HTMLButtonElement;
const btnDone = document.getElementById("btn-done") as HTMLButtonElement;
const btnRefreshResources = document.getElementById(
  "btn-refresh-resources",
) as HTMLButtonElement;
const resourcesErrorEl = document.getElementById(
  "resources-error",
) as HTMLElement;
const resourceListEl = document.getElementById(
  "resource-list",
) as HTMLUListElement;
const resourcePreviewEl = document.getElementById(
  "resource-preview",
) as HTMLElement;
const resourcesHintEl = document.getElementById(
  "resources-hint",
) as HTMLElement;

/** Latest successful structured payload for host-mediated download. */
let lastSuccessPayload: SuccessPayload | null = null;

let appRef: App | null = null;

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
  syncCapabilityHints();
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
  const block = result.content?.find(
    function isTextBlock(c: ContentBlock): boolean {
      return c.type === "text";
    },
  );
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
  cancelPanel.hidden = true;
  resultMetaEl.replaceChildren();
  headersBody.replaceChildren();
}

function renderSuccess(data: SuccessPayload): void {
  clearPanels();
  lastSuccessPayload = data;
  updateDownloadButton();
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
  lastSuccessPayload = null;
  updateDownloadButton();
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

function syncCapabilityHints(): void {
  const app = appRef;
  if (!app) return;
  const caps = app.getHostCapabilities();
  const parts: string[] = [
    "Load resources from the MCP server via the host proxy (list + read).",
  ];
  if (!caps?.serverResources) {
    parts.push(
      "This host did not advertise `serverResources`; list/read may still work.",
    );
  }
  if (!caps?.downloadFile) {
    parts.push("Download needs host support for `downloadFile`.");
  }
  resourcesHintEl.textContent = parts.join(" ");
  updateDownloadButton();
}

function updateDownloadButton(): void {
  const app = appRef;
  const supported = app?.getHostCapabilities()?.downloadFile != null;
  btnDownload.disabled = !supported || lastSuccessPayload === null;
}

function onToolInput(params: AppEventMap["toolinput"]): void {
  renderArgs(params.arguments as Record<string, unknown> | undefined);
}

function onToolResult(params: AppEventMap["toolresult"]): void {
  renderFromToolResult(params as unknown as CallToolResult);
}

function onToolCancelled(params: AppEventMap["toolcancelled"]): void {
  clearPanels();
  lastSuccessPayload = null;
  updateDownloadButton();
  cancelPanel.hidden = false;
  cancelTextEl.textContent = params.reason?.trim()
    ? params.reason
    : "The host cancelled this tool run.";
}

const app = new App({ name: "Website info", version: "1.0.0" });
appRef = app;

async function onTeardown(): Promise<Record<string, never>> {
  app.removeEventListener("toolinput", onToolInput);
  app.removeEventListener("toolresult", onToolResult);
  app.removeEventListener("toolcancelled", onToolCancelled);
  app.removeEventListener("hostcontextchanged", onHostContextChanged);
  return {};
}

app.addEventListener("toolinput", onToolInput);
app.addEventListener("toolresult", onToolResult);
app.addEventListener("toolcancelled", onToolCancelled);
app.addEventListener("hostcontextchanged", onHostContextChanged);

app.onteardown = onTeardown;

async function onDownloadClick(): Promise<void> {
  if (!lastSuccessPayload || !appRef) return;
  const json = JSON.stringify(lastSuccessPayload, null, 2);
  const { isError } = await appRef.downloadFile({
    contents: [
      {
        type: "resource",
        resource: {
          uri: "file:///fetch-website-info-result.json",
          mimeType: "application/json",
          text: json,
        },
      },
    ],
  });
  if (isError) {
    void appRef.sendLog({
      level: "warning",
      data: "Download was denied or cancelled by the host.",
      logger: "fetch-website-info",
    });
  }
}

async function onDoneClick(): Promise<void> {
  await app.requestTeardown();
}

function setResourcesError(message: string): void {
  resourcesErrorEl.hidden = false;
  resourcesErrorEl.textContent = message;
}

function clearResourcesError(): void {
  resourcesErrorEl.hidden = true;
  resourcesErrorEl.textContent = "";
}

async function onRefreshResourcesClick(): Promise<void> {
  if (!appRef) return;
  clearResourcesError();
  resourceListEl.replaceChildren();
  resourcePreviewEl.textContent = "Loading…";
  try {
    const result = await appRef.listServerResources();
    resourcePreviewEl.textContent = result.resources?.length
      ? "Select a resource to read."
      : "No resources returned.";
    for (const r of result.resources ?? []) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      const title = r.title ?? r.name ?? r.uri;
      b.textContent = title;
      b.addEventListener("click", () => {
        void readResourceIntoPreview(r.uri);
      });
      li.append(b);
      resourceListEl.append(li);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setResourcesError(`resources/list failed: ${msg}`);
    resourcePreviewEl.textContent = "Could not list resources.";
  }
}

async function readResourceIntoPreview(uri: string): Promise<void> {
  if (!appRef) return;
  clearResourcesError();
  resourcePreviewEl.textContent = "Reading…";
  try {
    const result = await appRef.readServerResource({ uri });
    const first = result.contents?.[0];
    if (!first) {
      resourcePreviewEl.textContent = "(empty contents)";
      return;
    }
    if ("text" in first && typeof first.text === "string") {
      const t = first.text;
      resourcePreviewEl.textContent = t.length > 12000
        ? `${t.slice(0, 12000)}\n… [truncated]`
        : t;
      return;
    }
    if ("blob" in first && typeof first.blob === "string") {
      resourcePreviewEl.textContent =
        `[binary resource, ${first.blob.length} base64 chars]`;
      return;
    }
    resourcePreviewEl.textContent = JSON.stringify(first, null, 2);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setResourcesError(`resources/read failed: ${msg}`);
    resourcePreviewEl.textContent = "Could not read resource.";
  }
}

btnDownload.addEventListener("click", () => {
  void onDownloadClick();
});

btnDone.addEventListener("click", () => {
  void onDoneClick();
});

btnRefreshResources.addEventListener("click", () => {
  void onRefreshResourcesClick();
});

void (async () => {
  await app.connect();
  syncCapabilityHints();
  const ctx = app.getHostContext();
  if (ctx) onHostContextChanged(ctx);
})();
