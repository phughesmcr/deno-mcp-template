/** Renders tool state and applies the host's context to the page. */
import {
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";

import type { Elements } from "./elements.ts";
import type { ParsedToolResult, WebsiteInfo } from "./toolResult.ts";

/** The message of a caught value, which need not be an `Error`. */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Follows the spec: fill a fixed container, and stay within a flexible one. */
function applyContainerDimensions(
  dimensions: NonNullable<McpUiHostContext["containerDimensions"]>,
): void {
  const { style } = document.documentElement;
  style.height = "height" in dimensions ? "100vh" : "";
  style.width = "width" in dimensions ? "100vw" : "";
  style.maxHeight = "maxHeight" in dimensions && dimensions.maxHeight
    ? `${dimensions.maxHeight}px`
    : "";
  style.maxWidth = "maxWidth" in dimensions && dimensions.maxWidth
    ? `${dimensions.maxWidth}px`
    : "";
}

/** Applies a host context, which may hold only the fields that changed. */
export function applyHostContext(ctx: McpUiHostContext): void {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
  if (ctx.containerDimensions) {
    applyContainerDimensions(ctx.containerDimensions);
  }
  if (ctx.safeAreaInsets) {
    const { top, right, bottom, left } = ctx.safeAreaInsets;
    document.body.style.padding = `${top}px ${right}px ${bottom}px ${left}px`;
  }
}

/** Creates the renderer for the tool's input and result panels. */
export function createToolView(els: Elements) {
  function clearPanels(): void {
    els.resultPanel.hidden = true;
    els.errorPanel.hidden = true;
    els.noticePanel.hidden = true;
    els.resultMeta.replaceChildren();
    els.headersBody.replaceChildren();
    els.runStatus.textContent = "";
  }

  function showError(message: string): void {
    clearPanels();
    els.errorText.textContent = message;
    els.errorPanel.hidden = false;
  }

  function showNotice(label: string, message: string): void {
    clearPanels();
    els.noticeLabel.textContent = label;
    els.noticeText.textContent = message;
    els.noticePanel.hidden = false;
  }

  function showSuccess(data: WebsiteInfo): void {
    clearPanels();
    const rows: [string, string][] = [
      ["URL", data.url],
      ["Status", String(data.status)],
      ["Status text", data.statusText || "—"],
      ["Redirected", data.redirected ? "Yes" : "No"],
      ["Timestamp", data.timestamp],
    ];
    for (const [term, detail] of rows) {
      const dt = document.createElement("dt");
      dt.textContent = term;
      const dd = document.createElement("dd");
      dd.textContent = detail;
      els.resultMeta.append(dt, dd);
    }
    for (const [name, value] of Object.entries(data.headers)) {
      const tr = document.createElement("tr");
      const nameCell = document.createElement("td");
      nameCell.textContent = name;
      const valueCell = document.createElement("td");
      valueCell.textContent = value;
      valueCell.className = "mono";
      tr.append(nameCell, valueCell);
      els.headersBody.append(tr);
    }
    els.runStatus.textContent = "Result received.";
    els.resultPanel.hidden = false;
  }

  return {
    showError,
    showNotice,

    /** Shows the requested URL while the tool runs. */
    showPending(url: unknown): void {
      clearPanels();
      els.argUrl.textContent = typeof url === "string" ? url : "—";
      els.runStatus.textContent = "Fetching…";
    },

    showResult(parsed: ParsedToolResult): void {
      if (parsed.kind === "success") showSuccess(parsed.data);
      else if (parsed.kind === "error") showError(parsed.message);
      else showNotice("Unexpected result", parsed.message);
    },

    /** True until a result, error or notice has been shown. */
    isWaiting(): boolean {
      return [els.resultPanel, els.errorPanel, els.noticePanel]
        .every((panel) => panel.hidden);
    },
  };
}
