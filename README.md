# Deno MCP Template

![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/phughesmcr/deno-mcp-template/ci.yml?label=CI)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/phughesmcr/deno-mcp-template/release.yml?label=release)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/phughesmcr/deno-mcp-template/deploy.yml?label=deploy)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/phughesmcr/deno-mcp-template/publish.yml?label=publish)

![License](https://img.shields.io/github/license/phughesmcr/deno-mcp-template)
![Typescript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)
![Repo Size](https://img.shields.io/github/languages/code-size/phughesmcr/deno-mcp-template)
![Sponsor](https://img.shields.io/github/sponsors/phughesmcr)

![Repo Logo](static/logo_124.png)

A simple template for writing MCP servers using [Deno](https://deno.com/), publishing them using [JSR.io](https://jsr.io), compiling them to a standalone binary, and using hosting on [Deno Deploy](https://deno.com/deploy).

The example server also uses [Deno KV](https://deno.com/kv) to implement a simple knowledge graph tool, and allow for session resumability (see `src/tools` for the implementation).

🥳 Just clone the repo and run `deno task setup` to setup the project for your own use.

ℹ️ **Deno is required**. Use `npm install -g deno` or `curl -fsSL <https://deno.land/install.sh> | sh`

## Usage

Replace the server name, and the package location in the following examples to correspond to your own MCP server.

You can set HOSTNAME and PORT in a `.env` if desired, or by passing `--hostname` and `--port` to the server.

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

# or with SSE (use `deno task start` first)
claude mcp add --transport sse my-mcp-server http://127.0.0.1:3001/mcp
```

## Project Structure

`App/` is a simple wrapper around the MCP server (`server.ts`), providing STDIO and SSE transport support, and HTTP routes for static files.

`mcp/` contains all the example tools, prompts, and resources.

The main project files are:

```markdown
deno.json     # Project configuration
main.ts       # The main entry point
src/              
├── app/                        
│   ├── App.ts                  # The main application class
│   ├── config.ts               # Configuration for the server
│   ├── express.ts              # Express server code
│   ├── inMemoryEventStore.ts   # In-memory event store for for session resumability
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
│   │   │   ├── mod.ts                      # Provides a single point of export for the knowledge graph
│   │   └── mod.ts                    # Provides a single point of export for all the MCP tools
│   └── mod.ts                  # Provides a single point of export for all the MCP internals
├── constants.ts                # Shared constants for the server and application
├── server.ts                   # The MCP server
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

‼️ By default this template server calls `await Deno.openKv()` - all KV functionality will be shared across users who access your server through `"command": "deno run -A --unstable-kv jsr:@your-scope/your-package`. You probably don't want this in production. Make sure user's can only read what they should have access to!

⚠️ You must grep this repo for "phughesmcr", "P. Hughes", "<github@phugh.es>", and "deno-mcp-template", and replace them with your own information.

⚠️ Remember to set any environment variables in both your Github repo settings and your Deno Deploy project settings (if applicable).

⚠️ Remember to check all files in `routes/` and `static/` as some of these files (e.g. `openapi.yaml`) will need modifying to match your MCP server's capabilities / endpoints.

⚠️ If using `enableDnsRebindingProtection`, you may need to add entries to `ALLOWED_ORIGINS` and `ALLOWED_HOSTS` in `constants.ts`. If not, you can disable `enableDnsRebindingProtection` in `app/express.ts` (it is enabled by default).

⚠️ `src/app/inMemoryEventStore.ts` is a simple implementation of session resumability. It is not suitable for production use.

⚠️ The example server runs with `deno run -A` which enables all of Deno's permissions. You should [finetune the permissions](https://docs.deno.com/runtime/fundamentals/security/) before deploying to production.

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

## License

MIT
