---
name: implementing-mcp-resources
description: Implement new MCP resources and resource templates in the deno-mcp-template project. Provides the exact file structure, type signatures, registration steps, and patterns for static resources, KV-backed resources, resource templates with URI patterns, and subscription-based updates. Use when adding a new resource, creating MCP resources, or asking how resources work in this project.
---

# Implementing MCP Resources

## Workflow

```
Task Progress:
- [ ] Step 1: Create resource file in src/mcp/resources/
- [ ] Step 2: Define name, URI/template, config, and readCallback (optionally taking ctx and deps)
- [ ] Step 3: Export as default ResourcePlugin or ResourceTemplatePlugin
- [ ] Step 4: Register in src/mcp/resources/mod.ts
- [ ] Step 5: (If KV-backed) Add URI-to-key mapping in kvKeys.ts
- [ ] Step 6: Run `deno task ci` to verify
```

## Resource Types

| Type | Use Case | URI | Plugin Type |
|------|----------|-----|-------------|
| **Static resource** | Fixed content at a known URI | `"hello://world"` | `ResourcePlugin` |
| **KV-backed resource** | Persistent, mutable state | `"counter://value"` | `ResourcePlugin` |
| **Resource template** | Dynamic URI with variables | `"greetings://{name}"` | `ResourceTemplatePlugin` |

## Static Resource Template

Create a new file in `src/mcp/resources/`.

```typescript
import type { ReadResourceResult, ResourceMetadata } from "@modelcontextprotocol/server";

import type { ResourcePlugin } from "$/mcp/plugin-types.ts";

const name = "myResource";

const uri = "my-scheme://my-path";

const config: ResourceMetadata = {
  description: "What this resource provides",
  mimeType: "text/plain", // or "application/json"
};

// Parameters are optional: (uri, ctx, deps)
async function readCallback(): Promise<ReadResourceResult> {
  return {
    contents: [{
      uri,
      text: "Resource content here",
    }],
  };
}

const module: ResourcePlugin = {
  type: "resource",
  name,
  uri,
  config,
  readCallback,
};

export default module;
```

## Resource Template (Dynamic URI)

For resources with variable URI segments like `greetings://{name}`:

```typescript
import {
  type CompleteResourceTemplateCallback,
  type ReadResourceResult,
  type ResourceMetadata,
  ResourceTemplate,
} from "@modelcontextprotocol/server";

import type { ResourceTemplatePlugin } from "$/mcp/plugin-types.ts";

const name = "myTemplate";

const suggestions = ["alpha", "beta"];

const completeName: CompleteResourceTemplateCallback = (value: string) => {
  const prefix = value.trim().toLowerCase();
  return suggestions.filter((s) => s.toLowerCase().startsWith(prefix)).slice(0, 5);
};

const template = new ResourceTemplate(
  "my-scheme://{variable}",
  {
    list: undefined,                       // optional: callback to list all instances
    complete: { variable: completeName },  // optional: autocomplete per variable
  },
);

const config: ResourceMetadata = {
  mimeType: "text/plain",
};

// Parameters are optional: (uri, variables, ctx, deps)
async function readCallback(
  uri: URL,
  variables: Record<string, unknown>,
): Promise<ReadResourceResult> {
  const variable = variables.variable as string;
  return {
    contents: [{
      uri: uri.toString(),
      text: `Content for ${variable}`,
    }],
  };
}

const module: ResourceTemplatePlugin = {
  type: "template",
  name,
  template,
  config,
  readCallback,
};

export default module;
```

## Registration

In `src/mcp/resources/mod.ts`:

1. Import the resource: `import myResource from "./myResource.ts";`
2. Add it to the `resources` array:

```typescript
export const resources: AnyResourcePlugin[] = [
  // ... existing resources
  myResource,
];
```

`createMcpServer` (`src/mcp/mod.ts`) calls `registerResource(server, resource, deps)` for each entry, which dispatches on `resource.type`:
- `"resource"` calls `server.registerResource(name, uri, config, (uri, ctx) => readCallback(uri, ctx, deps))`
- `"template"` calls `server.registerResource(name, template, config, (uri, variables, ctx) => readCallback(uri, variables, ctx, deps))`

A fresh `McpServer` is built per HTTP request, so keep state in KV (`deps.kv`), not in module scope.

## Key Types

From `src/mcp/plugin-types.ts`:

```typescript
export type ResourcePlugin = {
  type: "resource";
  name: string;
  uri: string;
  config: ResourceMetadata;
  readCallback: (uri: URL, ctx: ServerContext, deps: McpServerFactoryContext) => ResourceResult;
};

export type ResourceTemplatePlugin = {
  type: "template";
  name: string;
  template: ResourceTemplate;
  config: ResourceMetadata;
  readCallback: (
    uri: URL,
    variables: Variables,
    ctx: ServerContext,
    deps: McpServerFactoryContext,
  ) => ResourceResult;
};

export type AnyResourcePlugin = ResourcePlugin | ResourceTemplatePlugin;
```

`ResourceResult` is `ReadResourceResult | InputRequiredResult` (or a Promise of either), so a resource read can also return `inputRequired(...)`. `deps` is `McpServerFactoryContext` (`kv`, `events`, `requestState`, `publicBaseUrl`).

## KV-Backed Resources

For resources with persistent mutable state. Store functions take the `KvRuntime` from `deps.kv` rather than a global.

1. **Create a store file** (e.g. `myStore.ts`) with KV read/write functions:

```typescript
import type { KvRuntime } from "$/kv/runtime.ts";

export const MY_KEY: Deno.KvKey = ["resource", "my-resource", "value"];

export async function getValue(kv: KvRuntime): Promise<string> {
  const store = await kv.get();
  const entry = await store.get<string>(MY_KEY);
  return entry.value ?? "default";
}

export async function setValue(kv: KvRuntime, value: string): Promise<void> {
  const store = await kv.get();
  await store.set(MY_KEY, value);
}
```

2. **Use in the resource readCallback** (third parameter is `deps`):

```typescript
const readCallback: ResourcePlugin["readCallback"] = async (_uri, _ctx, { kv }) => {
  const value = await getValue(kv);
  return { contents: [{ uri, text: JSON.stringify({ value }) }] };
};
```

3. **Register the KV key mapping** in `src/mcp/resources/kvKeys.ts`:

```typescript
import { MY_URI } from "./myResource.ts";
import { MY_KEY } from "./myStore.ts";

export const RESOURCE_KV_KEYS: ReadonlyMap<string, Deno.KvKey> = new Map([
  [COUNTER_URI, COUNTER_KEY],
  [MY_URI, MY_KEY],  // add your mapping
]);
```

This enables automatic update notifications: when a tool mutates the KV key, the watcher publishes a `resource_updated` event and subscribers are notified.

## Subscription Flow

When `resourceSubscribe: true` in `mcpServerDefinition` (`src/mcp/serverDefinition.ts`), the server advertises `resources.subscribe`. There is no per-session subscription state:

1. `createApp` (`src/app/app.ts`) starts a KV watcher (`src/kv/watch.ts`) for every entry in `RESOURCE_KV_KEYS`
2. When a mapped KV key changes, the watcher publishes `{ kind: "resource_updated", uri }` on the shared `ServerEventBus`
3. Over HTTP, clients receive it on a `subscriptions/listen` stream; over STDIO, `src/app/stdio.ts` forwards it as `notifications/resources/updated`
4. No manual notification code needed in tools - just mutate KV state. For non-KV changes, call `deps.events.publish({ kind: "resource_updated", uri })`

## ReadResourceResult Format

Both resource types return the same shape:

```typescript
{
  contents: [{
    uri: string,       // the resource URI
    text: string,      // text content (for text/plain or application/json)
    // OR
    blob: string,      // base64-encoded binary content
  }],
}
```

Use `text` for text/JSON, `blob` for binary data. Set `mimeType` in config accordingly.

## Additional Resources

- For complete resource examples, see [examples.md](examples.md)
- MCP Resources spec: https://modelcontextprotocol.io/specification/2026-07-28/server/resources
