# MCP Resource Examples

Complete, working examples from the codebase.

## Static Resource - Hello World

`src/mcp/resources/helloWorld.ts` is the simplest resource:

```typescript
import type { ReadResourceResult, ResourceMetadata } from "@modelcontextprotocol/server";

import type { ResourcePlugin } from "$/mcp/plugin-types.ts";

const name = "helloWorld";

const uri = "hello://world";

const config: ResourceMetadata = {
  description: "A simple greeting message",
  mimeType: "text/plain",
};

async function readCallback(): Promise<ReadResourceResult> {
  return {
    contents: [
      {
        uri,
        text: "Hello, World! This is my first MCP resource.",
      },
    ],
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

Key patterns:
- `type: "resource"` for fixed-URI resources
- `readCallback` may take no parameters; the full signature is `(uri, ctx, deps)`
- Returns `ReadResourceResult` with `contents` array

---

## KV-Backed Resource - Counter

`src/mcp/resources/counter.ts` reads from Deno KV via `deps.kv`:

```typescript
import type { ReadResourceResult, ResourceMetadata } from "@modelcontextprotocol/server";

import type { ResourcePlugin } from "$/mcp/plugin-types.ts";
import { getPersistedCounterValue } from "./counterStore.ts";

export const COUNTER_URI = "counter://value";

const name = "counter";

const config: ResourceMetadata = {
  description: "A KV-backed counter resource",
  mimeType: "application/json",
};

const readCallback: ResourcePlugin["readCallback"] = async (
  _uri,
  _ctx,
  { kv },
): Promise<ReadResourceResult> => {
  const value = await getPersistedCounterValue(kv);
  return {
    contents: [
      {
        uri: COUNTER_URI,
        text: JSON.stringify({ value }),
      },
    ],
  };
};

const module: ResourcePlugin = {
  type: "resource",
  name,
  uri: COUNTER_URI,
  config,
  readCallback,
};

export default module;
```

Key patterns:
- Exports `COUNTER_URI` for tools to import
- Typing the callback as `ResourcePlugin["readCallback"]` gives `ctx` and `deps` their types
- JSON content with `mimeType: "application/json"`
- Persistence layer separated into `counterStore.ts`

### Counter Store - KV Persistence

`src/mcp/resources/counterStore.ts`:

```typescript
import type { KvRuntime } from "$/kv/runtime.ts";

export const COUNTER_KEY: Deno.KvKey = ["resource", "counter", "value"];

function ensureNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (value instanceof Deno.KvU64) {
    const asNumber = Number(value.value);
    if (!Number.isSafeInteger(asNumber)) {
      throw new Error("Counter value in KV exceeds Number.MAX_SAFE_INTEGER");
    }
    return asNumber;
  }
  throw new Error("Counter value in KV is not a number");
}

export async function getPersistedCounterValue(kv: KvRuntime): Promise<number> {
  const store = await kv.get();
  const entry = await store.get<unknown>(COUNTER_KEY);
  return ensureNumber(entry.value);
}

export async function incrementPersistedCounterValue(
  delta: number,
  kv: KvRuntime,
): Promise<number> {
  if (!Number.isSafeInteger(delta) || delta < 0) {
    throw new Error("Counter delta must be a non-negative safe integer");
  }

  const store = await kv.get();
  const result = await store.atomic().sum(COUNTER_KEY, BigInt(delta)).commit();
  if (!result.ok) {
    throw new Error("Failed to increment counter atomically");
  }
  const entry = await store.get<unknown>(COUNTER_KEY);
  return ensureNumber(entry.value);
}
```

Key patterns:
- `kv.atomic().sum()` for atomic counter increments
- `Deno.KvU64` handling for large integers
- Store functions take a `KvRuntime`; there is no global KV accessor to import
- Separate store file keeps persistence logic isolated

### KV Key Mapping

`src/mcp/resources/kvKeys.ts` maps URIs to KV keys; `createApp` watches each key and publishes `resource_updated` events:

```typescript
import { COUNTER_URI } from "./counter.ts";
import { COUNTER_KEY } from "./counterStore.ts";

export const RESOURCE_KV_KEYS: ReadonlyMap<string, Deno.KvKey> = new Map([
  [COUNTER_URI, COUNTER_KEY],
]);
```

Add new entries here for each KV-backed resource to enable automatic subscription notifications.

---

## Resource Template - Greetings

`src/mcp/resources/greetings.ts` uses a URI pattern with autocomplete:

```typescript
import {
  type CompleteResourceTemplateCallback,
  type ResourceMetadata,
  ResourceTemplate,
} from "@modelcontextprotocol/server";
import type { ReadResourceResult } from "@modelcontextprotocol/server";

import type { ResourceTemplatePlugin } from "$/mcp/plugin-types.ts";

const name = "greetings";

const nameSuggestions = [
  "Ada",
  "Alan",
  "Grace",
  "Linus",
  "Margaret",
  "Ken",
];

const completeName: CompleteResourceTemplateCallback = (value: string) => {
  const prefix = value.trim().toLowerCase();
  return nameSuggestions
    .filter((name) => name.toLowerCase().startsWith(prefix))
    .slice(0, 5);
};

const template = new ResourceTemplate(
  "greetings://{name}",
  {
    list: undefined,
    complete: {
      name: completeName,
    },
  },
);

const config: ResourceMetadata = {
  mimeType: "text/plain",
};

async function readCallback(
  uri: URL,
  variables: Record<string, unknown>,
): Promise<ReadResourceResult> {
  const _name = uri.toString().match(/^greetings:\/\/(.+)$/);
  if (!_name) throw new SyntaxError("Invalid greetings URI format");

  const name = (variables.name as string) ?? _name[1];
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    throw new SyntaxError("Name parameter is required and must be a non-empty string");
  }

  const sanitizedName = name
    .trim()
    .slice(0, 100)
    .replace(/[^\p{L}\p{N}\s\-']/gu, "");

  return {
    contents: [{
      uri: uri.toString(),
      text: `Hello, ${sanitizedName}! Welcome to MCP.`,
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

Key patterns:
- `ResourceTemplate` constructor takes URI pattern and options (`list`, `complete`)
- `complete` maps each variable name to a `CompleteResourceTemplateCallback`
- `readCallback` receives `(uri: URL, variables, ctx, deps)`; trailing parameters can be omitted
- Input sanitization to prevent injection
- `type: "template"` differentiates from static resources

---

## Registration Module

`src/mcp/resources/mod.ts`:

```typescript
import type { AnyResourcePlugin } from "$/mcp/plugin-types.ts";

import counter from "./counter.ts";
import greetings from "./greetings.ts";
import helloWorld from "./helloWorld.ts";

export const resources: AnyResourcePlugin[] = [
  counter,
  greetings,
  helloWorld,
  // ... more resources
];
```

---

## Minimal Starters

### Static Resource

```typescript
import type { ReadResourceResult, ResourceMetadata } from "@modelcontextprotocol/server";

import type { ResourcePlugin } from "$/mcp/plugin-types.ts";

const name = "TODO-name";
const uri = "TODO-scheme://TODO-path";

const config: ResourceMetadata = {
  description: "TODO description",
  mimeType: "text/plain",
};

async function readCallback(): Promise<ReadResourceResult> {
  return { contents: [{ uri, text: "TODO content" }] };
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

### Resource Template

```typescript
import {
  type ReadResourceResult,
  type ResourceMetadata,
  ResourceTemplate,
} from "@modelcontextprotocol/server";

import type { ResourceTemplatePlugin } from "$/mcp/plugin-types.ts";

const name = "TODO-name";

const template = new ResourceTemplate("TODO-scheme://{variable}", {
  list: undefined,
  complete: {},
});

const config: ResourceMetadata = {
  mimeType: "text/plain",
};

async function readCallback(
  uri: URL,
  variables: Record<string, unknown>,
): Promise<ReadResourceResult> {
  const variable = variables.variable as string;
  return { contents: [{ uri: uri.toString(), text: `TODO: ${variable}` }] };
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

Then register in `src/mcp/resources/mod.ts`:

```typescript
import myResource from "./myResource.ts";

export const resources: AnyResourcePlugin[] = [
  // ... existing resources
  myResource,
];
```
