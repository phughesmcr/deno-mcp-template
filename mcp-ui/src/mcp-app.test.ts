/// <reference lib="deno.ns" />
import { parseHTML } from "linkedom";

import { type Elements, findElements } from "./elements.ts";
import { createResourcesPanel } from "./resourcesPanel.ts";
import { applyHostContext, createToolView } from "./view.ts";

const read = (path: string): Promise<string> =>
  Deno.readTextFile(new URL(path, import.meta.url));

/** linkedom has no class for these tags, so `instanceof` checks the tag name. */
const byTagName = (tagName: string): object => ({
  [Symbol.hasInstance]: (value: unknown) =>
    value instanceof Element && value.tagName === tagName,
});

/** Loads the real page into a DOM and puts it on `globalThis`, as a browser would. */
async function loadPage(
  edit: (html: string) => string = (html) => html,
): Promise<void> {
  const { window } = parseHTML(edit(await read("../fetch-website-info.html")));
  Object.assign(globalThis, {
    document: window.document,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    HTMLButtonElement: window.HTMLButtonElement,
    HTMLUListElement: byTagName("UL"),
    HTMLTableSectionElement: byTagName("TBODY"),
  });
}

async function pageElements(): Promise<Elements> {
  await loadPage();
  return findElements();
}

function assertEquals(actual: unknown, expected: unknown): void {
  const [a, b] = [JSON.stringify(actual), JSON.stringify(expected)];
  if (a !== b) throw new Error(`expected ${b}, got ${a}`);
}

function assertBroken(
  name: string,
  selector: string,
  edit: (html: string) => string,
): void {
  Deno.test(`a page ${name} fails at startup`, async () => {
    await loadPage(edit);
    try {
      findElements();
    } catch (error) {
      if (String(error).includes(selector)) return;
      throw error;
    }
    throw new Error("findElements accepted a broken page");
  });
}

Deno.test("the page has every element the app requires", async () => {
  await pageElements();
});

assertBroken(
  "with no tbody",
  "#headers-table tbody",
  (html) => html.replace("<tbody></tbody>", ""),
);
assertBroken(
  "with the wrong list type",
  "#resource-list",
  (html) =>
    html.replace(
      '<ul class="resource-list" id="resource-list"></ul>',
      '<ol class="resource-list" id="resource-list"></ol>',
    ),
);
assertBroken("with a div for a button", "#btn-done", (html) =>
  html.replace(
    '<button type="button" class="btn btn-primary" id="btn-done" disabled>',
    '<button type="button" class="btn btn-primary" disabled>',
  ).replace("</header>", '<div id="btn-done"></div></header>'));

Deno.test("the page only uses style variables hosts can set", async () => {
  const schema = await read(
    "../node_modules/@modelcontextprotocol/ext-apps/dist/src/generated/schema.json",
  );
  const css = await read("./mcp-app.css");
  const used = new Set(
    [...css.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1]),
  );
  if (used.size === 0) throw new Error("found no style variables");
  assertEquals([...used].filter((name) => !schema.includes(`"${name}"`)), []);
});

Deno.test("each state shows exactly one panel", async () => {
  const els = await pageElements();
  const view = createToolView(els);
  const visible = () =>
    [els.resultPanel, els.errorPanel, els.noticePanel]
      .map((panel) => !panel.hidden);

  view.showPending("https://example.com");
  assertEquals(els.argUrl.textContent, "https://example.com");
  assertEquals(els.runStatus.textContent, "Fetching…");
  assertEquals(view.isWaiting(), true);

  view.showResult({
    kind: "success",
    data: {
      url: "https://example.com/",
      status: 200,
      statusText: "",
      redirected: true,
      headers: { server: "stub" },
      timestamp: "2026-11-06T00:00:00.000Z",
    },
  });
  assertEquals(visible(), [true, false, false]);
  assertEquals(els.headersBody.children.length, 1);
  assertEquals(view.isWaiting(), false);

  view.showResult({ kind: "error", message: "boom" });
  assertEquals(visible(), [false, true, false]);
  assertEquals(els.errorText.textContent, "boom");
  assertEquals(els.headersBody.children.length, 0);

  view.showResult({ kind: "unexpected", message: "odd" });
  assertEquals(visible(), [false, false, true]);
  assertEquals(els.noticeLabel.textContent, "Unexpected result");
});

Deno.test("the page sizes itself to the host's container", async () => {
  await loadPage();
  const { style } = document.documentElement;
  applyHostContext({ containerDimensions: { height: 400, maxWidth: 320 } });
  assertEquals([style.height, style.maxWidth], ["100vh", "320px"]);
});

Deno.test("text from the host is never parsed as HTML", async () => {
  const els = await pageElements();
  createToolView(els).showError("<img src=x>");
  assertEquals(els.errorText.children.length, 0);
});

Deno.test("refresh loads every page and blocks a second click", async () => {
  const els = await pageElements();
  const cursors: (string | undefined)[] = [];
  let disabledDuringLoad = false;
  const panel = createResourcesPanel(els, {
    listServerResources: (params) => {
      disabledDuringLoad = els.btnRefresh.disabled;
      cursors.push(params?.cursor);
      return Promise.resolve(
        params?.cursor ? { resources: [{ uri: "a://2", name: "two" }] } : {
          resources: [{ uri: "a://1", name: "one", title: "First" }],
          nextCursor: "next",
        },
      );
    },
    readServerResource: () => Promise.resolve({ contents: [] }),
  });
  await panel.refresh();
  assertEquals(cursors, [undefined, "next"]);
  assertEquals(disabledDuringLoad, true);
  assertEquals(els.btnRefresh.disabled, false);
  assertEquals(
    [...els.resourceList.children].map((item) => item.textContent),
    ["First", "two"],
  );
});

Deno.test("a list failure is shown in the panel", async () => {
  const els = await pageElements();
  const panel = createResourcesPanel(els, {
    listServerResources: () => Promise.reject(new Error("no")),
    readServerResource: () => Promise.resolve({ contents: [] }),
  });
  await panel.refresh();
  assertEquals(els.resourcesError.textContent, "resources/list failed: no");
  assertEquals(els.resourcesError.hidden, false);
  assertEquals(els.btnRefresh.disabled, false);
});

Deno.test("only the latest resource read updates the preview", async () => {
  const els = await pageElements();
  const answers = new Map<string, () => void>();
  const panel = createResourcesPanel(els, {
    listServerResources: () =>
      Promise.resolve({
        resources: [
          { uri: "a://slow", name: "slow" },
          { uri: "a://fast", name: "fast" },
        ],
      }),
    readServerResource: ({ uri }) =>
      new Promise((resolve) =>
        answers.set(
          uri,
          () => resolve({ contents: [{ uri, text: `body of ${uri}` }] }),
        )
      ),
  });
  await panel.refresh();
  const [slow, fast] = els.resourceList.querySelectorAll("button");
  slow?.click();
  fast?.click();
  answers.get("a://fast")?.();
  await Promise.resolve();
  answers.get("a://slow")?.();
  await new Promise((resolve) => setTimeout(resolve));
  assertEquals(els.resourcePreview.textContent, "body of a://fast");
});
