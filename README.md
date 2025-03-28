# Deno MCP Template Repo

![Build Status](https://github.com/phughesmcr/deno-mcp-template/workflows/CI/badge.svg)

![Repo Logo](static/logo_124.png)

A simple template for writing MCP servers using [Deno](https://deno.com/), publishing them using [JSR.io](https://jsr.io), and optionally using hosting on [Deno Deploy](https://deno.com/deploy).

The example server also uses [Deno KV](https://deno.com/kv) to implement a simple knowledge graph tool, and allow for session resumability.

ℹ️ **Deno is required**. Use `npm install -g deno` or `curl -fsSL <https://deno.land/install.sh> | sh`

## Usage

Replace the server name, and the package location in the following examples to correspond to your own MCP server.

You can set HOSTNAME and PORT in a `.env` if desired.

### `claude-desktop-config.json` using the MCP server published on JSR

```json
{
    "mcpServers": {
        "my-mcp-server": {
            "command": "deno run -A --unstable-kv jsr:@phughesmcr/deno-mcp-template"
        },
    }
}
```

### `claude-desktop-config.json` manually using the SSE endpoint

Start the server using `deno task start`.

```json
{
    "mcpServers": {
        "my-mcp-server": {
            "url": "http://localhost:3001/sse"
        },
    }
}
```

### `claude-desktop-config.json` manually using the HTTP endpoint

Start the server using `deno task start`.

```json
{
    "mcpServers": {
        "my-mcp-server": {
            "url": "http://localhost:3001/mcp"
        },
    }
}
```

### `claude-desktop-config.json` using the STDIO server

```json
{
    "mcpServers": {
        "my-mcp-server": {
            "command": "deno run -A --unstable-kv absolute/path/to/main.ts"
        },
    }
}
```

### Compiling to a binary

Run `deno task compile`.

You can then use your binary like any other MCP server, for example:

```json
{
    "mcpServers": {
        "my-local-mcp-server": {
            "command": "absolute/path/to/binary"
        },
    }
}
```

See [Deno Compile Docs](https://docs.deno.com/runtime/reference/cli/compile/) for more information.

## Development

⚠️ You must grep this repo for "phughesmcr", "P. Hughes", "<github@phugh.es>", and "deno-mcp-template", and replace them with your own information.

⚠️ Remember to set any environment variables in both your Github repo settings and your Deno Deploy project settings (if applicable).

⚠️ Remember to check all files in `routes/` and `static/` as some of these files (e.g. `openapi.yaml`) will need modifying to match your MCP server's capabilities / endpoints.

ℹ️ The example server runs with `deno run -A` which enables all of Deno's permissions. You should [finetune the permissions](https://docs.deno.com/runtime/fundamentals/security/) before deploying to production.

ℹ️ Run `deno task prep` to run the formatter, linter, and code checker.

### Publishing on JSR

In order for users to be able to run your server from the internet this example uses [JSR.io](https://jsr.io) for publishing servers.

JSR is "the open-source package registry for modern JavaScript and TypeScript", and works similarly to NPM.

Publishing your server in this way allows the user to run it using `deno run jsr:@your_scope/your_server_name` instead of having to clone the repo and set an absolute path.

For this to work, you will need to setup you [JSR.io](https://jsr.io) account and replace the relevant values in the codebase to match your package name and scope.

If you do not want to publish on JSR, remove `.github/workflows/publish.yml`.

### Hosting on Deno Deploy

Using Deno Deploy is not necessary if you only want your server to be published through JSR. However, implementing a simple server using Deno Deploy can be useful in several ways. For example, hosting an [`llms.txt`](./static/.well-known/llms.txt) file which describes your server to LLMs; adding an auth route; etc.

For this to work, you will need to setup your [Deno Deploy](https://deno.com/deploy) and replace the relevant values in the codebase to match your package name.

If you do not plan on using Deploy, remove `.github/workflows/deploy.yml`.

### DB with Deno KV

>"Deno KV is a key-value database built directly into the Deno runtime, available in the Deno.Kv namespace. It can be used for many kinds of data storage use cases, but excels at storing simple data structures that benefit from very fast reads and writes. Deno KV is available in the Deno CLI and on Deno Deploy." - [Deno KV Manual](https://docs.deno.com/deploy/kv/manual/)

Deno KV can be used without any additional dependencies or installs. Locally it will create a file-based database, and if you're using Deploy it is built right in, with no extra config.

This template server implements the [Knowledge Graph Memory Server](https://github.com/modelcontextprotocol/servers/tree/main/src/memory) example, from [The ModelContextProtocol Github](https://github.com/modelcontextprotocol), using KV to store and retrieve the graph.

## Extras

The repo includes the following quality-of-life files which aren't necessary for the server to run but which will enhance your vibecoding:

- `.cursor/mcp.json` adds the MCP server to Cursor.
- `.github/` adds Github sponsors info to your repo, and other Github features such as workflows.
- `.vscode/` has some recommended extensions and makes Deno the default formatter.
- `vendor/schema.ts` is the [2025-03-26 MCP schema from Anthropic](https://github.com/modelcontextprotocol/specification/blob/main/schema/2025-03-26/schema.ts).
- `CLAUDE.md` is a starter file for Claude Code. Run `claude init` after your first changes to keep it up-to-date.
- `.cursorignore` tells Cursor to exclude files in addition to `.gitignore`.
- `*.md`. These markdown files, e.g. "CODE_OF_CONDUCT.md", add various tabs and tags to you Github repo and help with community management.

## More Information

[Introducing the Model Context Protocol](https://www.anthropic.com/news/model-context-protocol).

[The ModelContextProtocol Github](https://github.com/modelcontextprotocol).

## Acknowledgements

`vendor/schema.ts` is the [2025-03-26 MCP schema from Anthropic](https://github.com/modelcontextprotocol/specification/blob/main/schema/2025-03-26/schema.ts) (MIT License).

## License

MIT
