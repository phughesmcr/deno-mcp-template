/**
 * MCP App view for fetch-website-info (vanilla + @modelcontextprotocol/ext-apps).
 * This file wires the page to the host; rendering lives in `view.ts`.
 */
import { App } from "@modelcontextprotocol/ext-apps";

import { findElements } from "./elements.ts";
import "./mcp-app.css";
import { createResourcesPanel } from "./resourcesPanel.ts";
import { parseToolResult, type WebsiteInfo } from "./toolResult.ts";
import { applyHostContext, createToolView, errorText } from "./view.ts";

const els = findElements();
const view = createToolView(els);
const app = new App({ name: "Website info", version: "1.0.0" });
const resources = createResourcesPanel(els, app);

/** Latest successful result, for the host-mediated download. */
let downloadable: WebsiteInfo | null = null;

function setDownloadable(data: WebsiteInfo | null): void {
  downloadable = data;
  const supported = app.getHostCapabilities()?.downloadFile !== undefined;
  els.btnDownload.disabled = !supported || data === null;
  els.downloadStatus.textContent = supported
    ? ""
    : "This host does not support downloads.";
}

async function download(): Promise<void> {
  if (!downloadable) return;
  els.downloadStatus.textContent = "";
  try {
    const { isError } = await app.downloadFile({
      contents: [{
        type: "resource",
        resource: {
          uri: "file:///fetch-website-info-result.json",
          mimeType: "application/json",
          text: JSON.stringify(downloadable, null, 2),
        },
      }],
    });
    if (isError) {
      els.downloadStatus.textContent = "The download was denied or cancelled.";
    }
  } catch (error) {
    els.downloadStatus.textContent = `Download failed: ${errorText(error)}`;
  }
}

// Handlers go on before connect() so no notification is missed.
app.addEventListener("toolinput", ({ arguments: args }) => {
  setDownloadable(null);
  view.showPending(args?.url);
});

app.addEventListener("toolresult", (result) => {
  const parsed = parseToolResult(result);
  setDownloadable(parsed.kind === "success" ? parsed.data : null);
  view.showResult(parsed);
});

app.addEventListener("toolcancelled", ({ reason }) => {
  setDownloadable(null);
  view.showNotice(
    "Tool cancelled",
    reason?.trim() || "The host cancelled this tool run.",
  );
});

app.addEventListener("hostcontextchanged", applyHostContext);

// The host waits for an answer before removing the view. There is nothing to save.
app.onteardown = () => ({});

// Not every error is fatal, so only show one if there is no result to replace.
app.onerror = (error) => {
  console.error(error);
  if (view.isWaiting()) {
    view.showError(`Could not read a message from the host: ${error.message}`);
  }
};

els.btnDownload.addEventListener("click", () => void download());
els.btnRefresh.addEventListener("click", () => void resources.refresh());
els.btnDone.addEventListener("click", () => {
  app.requestTeardown().catch((error) => {
    view.showError(`Could not close the view: ${errorText(error)}`);
  });
});

/** Buttons stay disabled until this succeeds, so nothing can race the handshake. */
async function connect(): Promise<void> {
  try {
    await app.connect();
    const context = app.getHostContext();
    if (context) applyHostContext(context);
    setDownloadable(downloadable);
    els.btnDone.disabled = false;
    if (app.getHostCapabilities()?.serverResources) {
      els.btnRefresh.disabled = false;
    } else {
      els.resourcesHint.textContent =
        "This host does not offer server resources.";
    }
  } catch (error) {
    view.showError(`Could not connect to the host: ${errorText(error)}`);
  }
}

void connect();
