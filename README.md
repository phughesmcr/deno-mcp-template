# 🦖🤖 Deno MCP Server Template

![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/phughesmcr/deno-mcp-template/ci.yml?label=CI)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/phughesmcr/deno-mcp-template/release.yml?label=release)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/phughesmcr/deno-mcp-template/deploy.yml?label=deploy)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/phughesmcr/deno-mcp-template/publish.yml?label=publish)

![Typescript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)
![Version](https://img.shields.io/badge/version-0.3.0-blue)
![Repo Size](https://img.shields.io/github/languages/code-size/phughesmcr/deno-mcp-template)
![License](https://img.shields.io/github/license/phughesmcr/deno-mcp-template)

![Sponsor](https://img.shields.io/github/sponsors/phughesmcr)

<div align="center">
    <img src="static/banner_480.png" alt="Repo Logo - a long-necked orange dinosaur walks in-front of a cliff-face with the letters M C P carved into it" width="320" />
</div>

This is a comprehensive template for writing MCP servers using [Deno](https://deno.com/).

Using Deno allows you to publish your MCP server using [JSR.io](https://jsr.io), compile it to a standalone binary, desktop extension (DXT), or host it on [Deno Deploy](https://deno.com/deploy) and other platforms.

## What's Inside?

### MCP Server

The MCP server is in `src/mcp/`. It currently implements prompts, resources (including dynamic resources), and tools. These are mostly the official examples from the [MCP Documentation](https://modelcontextprotocol.io/), giving a good starting point for your own features.

The main tool example is the [knowledge graph memory server](https://github.com/modelcontextprotocol/servers/tree/main/src/memory) example from the [MCP Documentation](https://modelcontextprotocol.io/), implemented using [Deno KV](https://deno.com/kv) for storage.

### App

The "app" component, found in `src/app/`, wraps the MCP server in some convenience functions for serving HTTP routes, transport management, logging, etc. It is designed to need only a few changes to get your MCP server up and running, so you don't have to worry about setting up best practices every time you start a new project, (see ⚠️ below).

ℹ️ You can control the log level using the `MCP_LOG_LEVEL` environment variable or by passing `--log-level` to the server. E.g. `--log-level debug`.

#### HTTP Server

The app uses `Deno.serve` to start an HTTP server built with [Hono](https://hono.dev/). The server features comprehensive middleware including rate limiting, CORS protection, CSRF protection, security headers, request timeouts, and session management. DNS rebinding protection is also built in and enabled by default.

ℹ️ For DNS rebinding protection, you can set the `ALLOWED_ORIGINS` and `ALLOWED_HOSTS` variables (see [Config](#config))

⚠️ If no allowed hosts or origins are set, the server will allow all origins and hosts.

ℹ️ You can disable the HTTP server by setting `MCP_NO_HTTP=true` in your `.env` file, or by passing `--no-http` to the server.

#### STDIO Server

By default the app will automatically start listening for STDIO connections.

ℹ️ You can disable the STDIO transport by setting `MCP_NO_STDIO=true` in your `.env` file, or by passing `--no-stdio` to the server.

## Quick Start

```bash
# Install Deno
curl -fsSL https://deno.land/install.sh | sh

# Clone the repo (replace `mcp-server` with your own server name)
gh repo create mcp-server --template phughesmcr/deno-mcp-template
cd mcp-server

# Setup the project variables for your needs
deno task setup

# Start the server
deno task start

# or run with the @modelcontextprotocol/inspector to test your server
deno task dev
```

Once you're ready to start adding your own tools, prompts, and resources, begin by editing `src/constants/**.ts`, examine the `src/app` directory for any changes you need to make (e.g., CORS settings in `src/app/http/middleware.ts`), and then follow the code patterns in the `src/mcp/` directory to create your own MCP features.

## Using your MCP server

Replace the server name, and the package location in the following examples to correspond to your own MCP server.

These example are for Anthropic's products, but will work with other services that support MCP (e.g. Cursor, LMStudio, etc.)

### `claude-desktop-config.json` using the MCP server published on JSR

```json
{
    "mcpServers": {
        "my-mcp-server": {
            "command": "deno run -A --unstable-kv jsr:@your-scope/your-package"
        },
    }
}
```

### `claude-desktop-config.json` using the HTTP server

Start the server using `deno task start`.

```json
{
    "mcpServers": {
        "my-mcp-server": {
            "command": "npx",
            "args": ["mcp-remote", "http://localhost:3001/mcp"]
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

Run `deno task compile:all` (or `compile:win`, `compile:mac:arm64`, etc. for a specific platform).

You can then use your binary like any other MCP server, for example:

```json
{
    "mcpServers": {
        "my-mcp-server": {
            "command": "absolute/path/to/binary"
        },
    }
}
```

 See [Deno Compile Docs](https://docs.deno.com/runtime/reference/cli/compile/) for more information.

### Compile to a Claude Desktop Extension (DXT)

Anthropic's [desktop extensions](https://www.anthropic.com/engineering/desktop-extensions) tool packages MCP servers into a single-click install for Claude Desktop.

Run `deno task dxt:all` to compile the server to a DXT package for all platforms (Windows, Mac, Linux).

You can replace `dxt:all` with `dxt:win`, `dxt:mac:arm64`, `dxt:mac:x64`, `dxt:linux:x64`, or `dxt:linux:arm64` to compile for a specific platform.

This will create a `dist/server.dxt` file you can share with others - they won't need to install Deno or any other dependencies.

ℹ️ Ensure `static/dxt-manifest.json` is updated with correct information for your server.

### Claude Code

```bash
# Compiled binary:
claude mcp add my-mcp-server "absolute/path/to/binary"

# or with HTTP (use `deno task start` first)
claude mcp add --transport http my-mcp-server http://localhost:3001/mcp
```

## Project Structure

`src/app/` is a simple wrapper around the MCP server, providing STDIO and HTTP transports, and HTTP routes for static files.

`src/mcp/` contains the MCP server and all the example tools, prompts, and resources.

The main project files are:

```markdown
deno.json     # Project configuration
main.ts       # The main entry point
src/              
├── app/    
│   ├── http/
│   │   ├── manager.ts            # The HTTP transport & state manager
│   │   ├── middleware.ts         # Middleware for the HTTP server
│   │   └── server.ts             # The Hono HTTP server
│   ├── app.ts                  # The main application class
│   ├── config.ts               # Parses CLI args and env vars into an AppConfig object
│   ├── inMemoryEventStore.ts   # Simple in-memory event store for for session resumability
│   ├── logger.ts               # A simple logger that doesn't interfere with stdout
│   ├── signals.ts              # Global signal handling for handling SIGINT, SIGTERM, etc.
│   └── stdio.ts                # The STDIO transport & state manager
├── constants/  
│   ├── app.ts                  # Constants for the App (e.g., name, description, etc.)
│   ├── cli.ts                  # Constants for the CLI (e.g., help text, args, etc.)
│   ├── env.ts                  # Constants for the ENV variables 
│   ├── http.ts                 # Constants for the HTTP server (e.g., headers, ports, etc.)
│   ├── mcp.ts                  # Constants for the MCP server (e.g., capabilities, etc.)
│   ├── mod.ts                  # Single point of export for all constants (`$/constants`)
│   └── validation.ts           # Constants for the various validation functions (e.g., log level)
├── mcp/ 
│   ├── prompts/                             
│   │   ├── codeReview.ts                   # A simple code-review prompt example
│   │   ├── mod.ts                          # Provides a single point of export for all the MCP prompts
│   │   └── schemas.ts                      # Zod schemas for MCP prompts
│   ├── resources/                             
│   │   ├── greetings.ts                    # A simple resource template (dynamic resource) example
│   │   ├── helloWorld.ts                   # A simple resource (direct resource) example
│   │   ├── mod.ts                          # Provides a single point of export for all the MCP resources
│   │   └── schemas.ts                      # Zod schemas for MCP resources
│   ├── tools/                             
│   │   ├── knowledgeGraph/                 # The knowledge graph example tool
│   │   │   ├── knowledgeGraphManager.ts    # The knowledge graph class
│   │   │   ├── methods.ts                  # Adaptors for converting graph function to MCP tool calls/results
│   │   │   ├── mod.ts                      # Provides a single point of export for the knowledge graph
│   │   │   ├── sanitization.ts             # Input sanitization utilities for knowledge graph data
│   │   │   └── schemas.ts                  # Zod schemas for knowledge graph tools
│   │   └── mod.ts                          # Provides a single point of export for all the MCP tools
│   ├── middleware.ts           # Middleware for the MCP server (tool-call validation, etc.)
│   └── mod.ts                  # Provides a single point of export for the MCP server and all the MCP internals
├── schemas.ts                  # Shared Zod schemas
├── types.ts                    # Shared types
└── utils.ts                    # Shared utility
static/             
├── .well-known/    
│   ├── llms.txt                # An example llms.txt giving LLMs information about the server    
│   └── openapi.yaml            # An example OpenAPI specification for the server 
└── dxt-manifest.json           # The manifest for the DXT package
```

## Config

| Environment Variable | Flag        | Default     | Description |
| -------------------- | ----------- | ----------- | ----------- |
| MCP_LOG_LEVEL        | -l          | "info"      | The log level to use |
| MCP_HTTP_HOSTNAME    | -n          | "localhost" | The hostname to listen on for the HTTP server |
| MCP_HTTP_PORT        | -p          | "3001"      | The port to listen on for the HTTP server |
| MCP_HEADERS          | -H          | ""          | The headers to set for the HTTP server (CLI flag is a collection) |
| MCP_ALLOW_ORIGINS    | --origin    | "*"         | The allowed origins for the HTTP server (CLI flag is a collection) |
| MCP_ALLOW_HOSTS      | --host      | "localhost" | The allowed hosts for the HTTP server (CLI flag is a collection) |
| MCP_NO_HTTP          | --no-http   | `false`     | Disable the HTTP server |
| MCP_NO_STDIO         | --no-stdio  | `false`     | Disable the STDIO server |
| MCP_NO_DNS_REBINDING | --no-dns-rebinding | `false` | Disable DNS rebinding protection |

⚠️ CLI flags take precedence over environment variables, except in collections (e.g. `--H`, `--origin` and `--host`), where the two are combined.

## Development

Run `deno task setup` to setup the project for your own use.

‼️ By default the knowledge graph tool calls `await Deno.openKv()` - all KV functionality will be shared across users who access your server. You probably don't want this in production. Make sure user's can only read what they should have access to!

⚠️ You must grep this repo for "phughesmcr", "P. Hughes", "<github@phugh.es>", and "deno-mcp-template", and replace them with your own information. (The setup task will do this for you.)

⚠️ If using `enableDnsRebindingProtection`, you may need to add entries to `ALLOWED_ORIGINS` and `ALLOWED_HOSTS` in `src/constants/http.ts`. If not, you can disable `enableDnsRebindingProtection` in `src/app/http/manager.ts` (it is enabled by default).

⚠️ `src/app/inMemoryEventStore.ts` is a simple utility for session resumability. It is **not** suitable for production use.

⚠️ The example server runs with `deno run -A` which enables all of Deno's permissions. You should [finetune the permissions](https://docs.deno.com/runtime/fundamentals/security/) before deploying to production.

ℹ️ Remember to check all files in `static/` as some of these files (e.g. `openapi.yaml`, `dxt-manifest.json`) will need modifying to match your MCP server's capabilities / endpoints.

ℹ️  Remember to set any environment variables in both your Github repo settings and your Deno Deploy project settings (if applicable).

ℹ️ Run `deno task prep` to run the formatter, linter, and code checker.

### Serving from JSR

In order for users to be able to run your server from the internet this example uses [JSR.io](https://jsr.io).

JSR is "the open-source package registry for modern JavaScript and TypeScript", and works similarly to NPM.

Publishing your server in this way allows users to run it using `deno run -A jsr:@your_scope/your_server_name` instead of having to clone the repo and set an absolute path.

For this to work, you will need a [JSR.io](https://jsr.io) account, then replace the relevant values in the codebase to match your package name and scope.

If you do not want to publish on JSR, remove `.github/workflows/publish.yml`.

### Hosting on Deno Deploy

Using Deno Deploy is not necessary if you only want your server to be published through JSR, or locally. However, implementing a simple server using Deno Deploy can be useful in several ways. For example, hosting an [`llms.txt`](./static/.well-known/llms.txt) file to describe your server to LLMs; adding an auth route; etc.

For this to work, you will need to setup your [Deno Deploy](https://deno.com/deploy) account,and replace the relevant values in the codebase to match your package name.

If you do not plan on using Deno Deploy, remove `.github/workflows/deploy.yml`.

### DB with Deno KV

>"Deno KV is a key-value database built directly into the Deno runtime, available in the `Deno.Kv` namespace. It can be used for many kinds of data storage use cases, but excels at storing simple data structures that benefit from very fast reads and writes. Deno KV is available in the Deno CLI and on Deno Deploy." - [Deno KV Manual](https://docs.deno.com/deploy/kv/manual/)

Deno KV can be used without any additional dependencies or installs. Locally it will create a file-based database, and if you're using Deploy it is built right in, with no extra config.

This template server implements the [Knowledge Graph Memory Server](https://github.com/modelcontextprotocol/servers/tree/main/src/memory) example, from [The ModelContextProtocol Github](https://github.com/modelcontextprotocol), using KV to store and retrieve the graph.

Important: see ‼️ above.

## Extras

The repo includes the following quality-of-life files which aren't necessary for the server to run but which will enhance your vibecoding:

- `.cursor/rules/` agent rules for Cursor.
- `.github/` adds Github sponsors info to your repo, and other Github features such as workflows.
- `.vscode/` has some recommended extensions and makes Deno the default formatter.
- `.cursorignore` tells Cursor to exclude files in addition to `.gitignore`.
- `CLAUDE.md` is a starter file for Claude Code. Run `claude init` after your first changes to keep it up-to-date.
- `*.md`. These markdown files, e.g. "CODE_OF_CONDUCT.md", add various tabs and tags to you Github repo and help with community management.

## More Information

[Introducing the Model Context Protocol](https://www.anthropic.com/news/model-context-protocol).

[The ModelContextProtocol Github](https://github.com/modelcontextprotocol).

## Acknowledgements

If you use this template, please contribute fixes and features, star the repo, and consider sponsoring.

## License

MIT

This is a boilerplate / template repo, not a library; meaning you do need to make changes before deploying to production.
