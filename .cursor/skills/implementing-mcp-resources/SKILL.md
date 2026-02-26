---
name: implementing-mcp-resources
description: Implement new MCP resources and resource templates in the deno-mcp-template project. Provides the exact file structure, type signatures, registration steps, and patterns for static resources, KV-backed resources, resource templates with URI patterns, and subscription-based updates. Use when adding a new resource, creating MCP resources, or asking how resources work in this project.
---

# Implementing MCP Resources

## Workflow

```
Task Progress:
- [ ] Step 1: Create resource file in src/mcp/resources/
- [ ] Step 2: Define name, URI/template, config, and readCallback
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
import type { ResourceMetadata } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";

import type { ResourcePlugin } from "$/shared/types.ts";

const name = "myResource";

const uri = "my-scheme://my-path";

const config: ResourceMetadata = {
  description: "What this resource provides",
  mimeType: "text/plain",  // or "application/json"
};

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
  type ResourceMetadata,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";

import type { ResourceTemplatePlugin } from "$/shared/types.ts";

const name = "myTemplate";

const completeName: CompleteResourceTemplateCallback = (value) => {
  const prefix = value.trim().toLowerCase();
  return suggestions.filter((s) => s.toLowerCase().startsWith(prefix)).slice(0, 5);
};

const template = new ResourceTemplate(
  "my-scheme://{variable}",
  {
    list: undefined,               // optional: callback to list all instances
    complete: { variable: completeName },  // optional: autocomplete per variable
  },
);

const config: ResourceMetadata = {
  mimeType: "text/plain",
};

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

The server dispatches based on `resource.type`:
- `"resource"` calls `registerResource(name, uri, config, readCallback)`
- `"template"` calls `registerResource(name, template, config, readCallback)`

## Key Types

From `src/shared/types.ts`:

```typescript
export type ResourcePlugin = {
  type: "resource";
  name: string;
  uri: string;
  config: ResourceMetadata;
  readCallback: ReadResourceCallback;
};

export type ResourceTemplatePlugin = {
  type: "template";
  name: string;
  template: ResourceTemplate;
  config: ResourceMetadata;
  readCallback: ReadResourceTemplateCallback;
};

export type AnyResourcePlugin = ResourcePlugin | ResourceTemplatePlugin;
```

## KV-Backed Resources

For resources with persistent mutable state:

1. **Create a store file** (e.g. `myStore.ts`) with KV read/write functions:

```typescript
import { getKvStore } from "$/app/kv/mod.ts";

export const MY_KEY: Deno.KvKey = ["resource", "my-resource", "value"];

export async function getValue(): Promise<string> {
  const kv = await getKvStore();
  const entry = await kv.get<string>(MY_KEY);
  return entry.value ?? "default";
}

export async function setValue(value: string): Promise<void> {
  const kv = await getKvStore();
  await kv.set(MY_KEY, value);
}
```

2. **Use in the resource readCallback**:

```typescript
import { getValue } from "./myStore.ts";

async function readCallback(): Promise<ReadResourceResult> {
  const value = await getValue();
  return { contents: [{ uri, text: JSON.stringify({ value }) }] };
}
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

This enables automatic subscription notifications — when a tool mutates the KV key, the subscription tracker detects the change and notifies subscribed clients.

## Subscription Flow

Resources with `subscribe: true` in `SERVER_CAPABILITIES` get automatic subscription support:

1. Client subscribes to a URI
2. `subscriptionTracker.subscribe()` starts watching the mapped KV key
3. When the KV key changes, all subscribed clients receive `resourceUpdated` notifications
4. No manual notification code needed in tools — just mutate KV state

The subscription tracker (`src/mcp/resources/subscriptionTracker.ts`) handles ref-counting, KV watching, and notifier lifecycle automatically.

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
- MCP Resources spec: https://modelcontextprotocol.io/specification/2025-06-18/server/resources
