/** The "Server resources" panel: lists and previews resources through the host. */
import type { App } from "@modelcontextprotocol/ext-apps";

import type { Elements } from "./elements.ts";
import { errorText } from "./view.ts";

const PREVIEW_LIMIT = 12_000;

type ResourceHost = Pick<App, "listServerResources" | "readServerResource">;

/** Creates the panel. The caller enables Refresh once the host allows it. */
export function createResourcesPanel(els: Elements, host: ResourceHost) {
  /** Only the latest read may update the preview. */
  let latestRead = 0;

  function setError(message: string): void {
    els.resourcesError.hidden = message === "";
    els.resourcesError.textContent = message;
  }

  async function read(uri: string): Promise<void> {
    const readId = ++latestRead;
    setError("");
    els.resourcePreview.textContent = "Reading…";
    try {
      const { contents } = await host.readServerResource({ uri });
      if (readId !== latestRead) return;
      const first = contents[0];
      if (!first) els.resourcePreview.textContent = "(empty contents)";
      else if ("text" in first) {
        els.resourcePreview.textContent = first.text.length > PREVIEW_LIMIT
          ? `${first.text.slice(0, PREVIEW_LIMIT)}\n… [truncated]`
          : first.text;
      } else {
        els.resourcePreview.textContent =
          `[binary resource, ${first.blob.length} base64 chars]`;
      }
    } catch (error) {
      if (readId !== latestRead) return;
      setError(`resources/read failed: ${errorText(error)}`);
      els.resourcePreview.textContent = "Could not read resource.";
    }
  }

  function addResource(uri: string, label: string): void {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => void read(uri));
    const item = document.createElement("li");
    item.append(button);
    els.resourceList.append(item);
  }

  return {
    /** Reloads every page of the list. Refresh stays disabled meanwhile. */
    async refresh(): Promise<void> {
      els.btnRefresh.disabled = true;
      latestRead += 1; // A read still in flight belongs to the old list.
      setError("");
      els.resourceList.replaceChildren();
      els.resourcePreview.textContent = "Loading…";
      try {
        let cursor: string | undefined;
        do {
          const page = await host.listServerResources({ cursor });
          for (const { uri, name, title } of page.resources) {
            addResource(uri, title ?? name);
          }
          cursor = page.nextCursor;
        } while (cursor);
        els.resourcePreview.textContent = els.resourceList.children.length
          ? "Select a resource to read."
          : "No resources returned.";
      } catch (error) {
        setError(`resources/list failed: ${errorText(error)}`);
        els.resourcePreview.textContent = "Could not list resources.";
      } finally {
        els.btnRefresh.disabled = false;
      }
    },
  };
}
