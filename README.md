# 🦖🤖 Deno MCP Server Template 

![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/phughesmcr/deno-mcp-template/ci.yml?label=CI)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/phughesmcr/deno-mcp-template/release.yml?label=release)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/phughesmcr/deno-mcp-template/deploy.yml?label=deploy)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/phughesmcr/deno-mcp-template/publish.yml?label=publish)

![License](https://img.shields.io/github/license/phughesmcr/deno-mcp-template)
![Typescript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)
![Repo Size](https://img.shields.io/github/languages/code-size/phughesmcr/deno-mcp-template)
![Sponsor](https://img.shields.io/github/sponsors/phughesmcr)

<div align="center">
    <img src="static/banner_480.png" alt="Repo Logo - a long-necked orange dinosaur walks in-front of a cliff-face with the letters M C P carved into it" width="320" />
</div>

This is a simple but comprehensive template for writing MCP servers using [Deno](https://deno.com/).

Using Deno allows you to publish your MCP server using [JSR.io](https://jsr.io), compile it to a standalone binary, or host it on [Deno Deploy](https://deno.com/deploy).

The repo has an `src/app` component which wraps the MCP server in some convenience functions for serving HTTP and STDIO routes and transports, logging, etc. So you don't have to worry about setting up best practices every time you start a new project, the "app" is designed to need only a few changes to get your MCP server up and running (see ⚠️ below).

The MCP server itself is in `src/mcp/`. It currently implements prompts, resources, and tools. These are mostly the official examples from the [MCP Documentation](https://modelcontextprotocol.io/), giving a good starting point for your own features.

The example server also uses [Deno KV](https://deno.com/kv) to implement a simple knowledge graph tool (see `src/mcp/tools/knowledgeGraph` for the implementation).

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

Once you're ready to start adding your own tools, prompts, and resources, begin by editing `src/constants.ts`, examine the `src/app` directory for any changes you need to make (e.g., CORS settings in `src/app/express.ts`), and then follow the code patterns in the `src/mcp/` directory to create your own MCP features.

## Usage

Replace the server name, and the package location in the following examples to correspond to your own MCP server.

You can set HOSTNAME and PORT in a `.env` if desired, or by passing `--hostname` and `--port` to the server.

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

### `claude-desktop-config.json` manually using the SSE/HTTP endpoint

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

Run `deno task compile`. See [Deno Compile Docs](https://docs.deno.com/runtime/reference/cli/compile/) for more information.

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

### Claude Code

```bash
# Compiled binary:
claude mcp add my-mcp-server "absolute/path/to/binary"

# or with HTTP (use `deno task start` first)
claude mcp add --transport http my-mcp-server http://127.0.0.1:3001/mcp
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
│   ├── app.ts                  # The main application class
│   ├── config.ts               # Configuration for the server
│   ├── express.ts              # Express server code
│   └── inMemoryEventStore.ts   # In-memory event store for for session resumability
├── mcp/ 
│   ├── prompts/                             
│   │   ├── codeReview.ts                   # A simple code-review prompt example
│   │   └── mod.ts                          # Provides a single point of export for all the MCP prompts
│   ├── resources/                             
│   │   ├── greetings.ts                    # A simple resource template (dynamic resource) example
│   │   ├── helloWorld.ts                   # A simple resource (direct resource) example
│   │   └── mod.ts                          # Provides a single point of export for all the MCP resources
│   ├── tools/                             
│   │   ├── knowledgeGraph/                 # The knowledge graph example tool
│   │   │   ├── knowledgeGraphManager.ts    # The knowledge graph class
│   │   │   ├── methods.ts                  # Adaptors for converting graph function to MCP tool calls/results
│   │   │   └── mod.ts                      # Provides a single point of export for the knowledge graph
│   │   └── mod.ts                    # Provides a single point of export for all the MCP tools
│   └── mod.ts                  # Provides a single point of export for the MCP server and all the MCP internals
├── constants.ts                # Shared constants for the server and application
├── types.ts                    # Shared types for the MCP server
└── utils.ts                    # Shared utility functions for the MCP server
static/             
├── .well-known/    
│   ├── llms.txt                # An example llms.txt giving LLMs information about the server    
│   └── openapi.yaml            # An example OpenAPI specification for the server 
vendor/
└── schema.ts                   # The 2025-06-18 MCP schema from Anthropic
```

## Development

Run `deno task setup` to setup the project for your own use.

‼️ By default the knowledge graph tool calls `await Deno.openKv()` - all KV functionality will be shared across users who access your server through `"command": "deno run -A --unstable-kv jsr:@your-scope/your-package`. You probably don't want this in production. Make sure user's can only read what they should have access to!

⚠️ You must grep this repo for "phughesmcr", "P. Hughes", "<github@phugh.es>", and "deno-mcp-template", and replace them with your own information. (The setup task will do this for you.)

⚠️ Remember to set any environment variables in both your Github repo settings and your Deno Deploy project settings (if applicable).

⚠️ Remember to check all files in `static/` as some of these files (e.g. `openapi.yaml`) will need modifying to match your MCP server's capabilities / endpoints.

⚠️ If using `enableDnsRebindingProtection`, you may need to add entries to `ALLOWED_ORIGINS` and `ALLOWED_HOSTS` in `src/constants.ts`. If not, you can disable `enableDnsRebindingProtection` in `src/app/express.ts` (it is enabled by default).

⚠️ `src/app/inMemoryEventStore.ts` is a simple utility for session resumability. It is **not** suitable for production use.

⚠️ The example server runs with `deno run -A` which enables all of Deno's permissions. You should [finetune the permissions](https://docs.deno.com/runtime/fundamentals/security/) before deploying to production.

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
- `vendor/schema.ts` is the [2025-06-18 MCP schema from Anthropic](https://github.com/modelcontextprotocol/specification/blob/main/schema/2025-06-18/schema.ts).
- `CLAUDE.md` is a starter file for Claude Code. Run `claude init` after your first changes to keep it up-to-date.
- `.cursorignore` tells Cursor to exclude files in addition to `.gitignore`.
- `*.md`. These markdown files, e.g. "CODE_OF_CONDUCT.md", add various tabs and tags to you Github repo and help with community management.

## More Information

[Introducing the Model Context Protocol](https://www.anthropic.com/news/model-context-protocol).

[The ModelContextProtocol Github](https://github.com/modelcontextprotocol).

## Acknowledgements

`vendor/schema.ts` is the [2025-06-18 MCP schema from Anthropic](https://github.com/modelcontextprotocol/specification/blob/main/schema/2025-06-18/schema.ts) (MIT License).

If you use this template, please contribute fixes and features, star the repo, and consider sponsoring.

## License

MIT

This is a boilerplate / template repo, not a library; meaning you do need to make changes before deploying to production. 
