/** Finds an element the page must contain, so a mismatch with the HTML fails at startup. */
function requireElement<T extends HTMLElement>(
  selector: string,
  type: new () => T,
): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) {
    throw new Error(`Expected ${type.name} at "${selector}"`);
  }
  return element;
}

/** Looks up every element the app uses. Throws if the page does not match. */
export function findElements() {
  return {
    argUrl: requireElement("#arg-url", HTMLElement),
    runStatus: requireElement("#run-status", HTMLElement),
    resultPanel: requireElement("#result-panel", HTMLElement),
    resultMeta: requireElement("#result-meta", HTMLElement),
    headersBody: requireElement(
      "#headers-table tbody",
      HTMLTableSectionElement,
    ),
    errorPanel: requireElement("#error-panel", HTMLElement),
    errorText: requireElement("#error-text", HTMLElement),
    noticePanel: requireElement("#notice-panel", HTMLElement),
    noticeLabel: requireElement("#notice-label", HTMLElement),
    noticeText: requireElement("#notice-text", HTMLElement),
    btnDownload: requireElement("#btn-download", HTMLButtonElement),
    btnDone: requireElement("#btn-done", HTMLButtonElement),
    downloadStatus: requireElement("#download-status", HTMLElement),
    btnRefresh: requireElement("#btn-refresh-resources", HTMLButtonElement),
    resourcesHint: requireElement("#resources-hint", HTMLElement),
    resourcesError: requireElement("#resources-error", HTMLElement),
    resourceList: requireElement("#resource-list", HTMLUListElement),
    resourcePreview: requireElement("#resource-preview", HTMLElement),
  };
}

export type Elements = ReturnType<typeof findElements>;
