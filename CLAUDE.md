# CLAUDE.md - Deno MCP Template Development Guide

Deno version: ^2.4.0

## Build/Development Commands

Start: `deno task start`
Dev mode: `deno task dev`
Format, lint, and check code: `deno task prep`

## Project Structure

```markdown
deno.json     # Project configuration
main.ts       # The main entry point
src/              
├── app/    
│   ├── http/
│   │   ├── inMemoryEventStore.ts   # Simple in-memory event store for for session resumability
│   │   ├── manager.ts              # The HTTP transport & state manager
│   │   ├── middleware.ts           # Middleware for the HTTP server
│   │   └── server.ts               # The Hono HTTP server (the MCP server)
│   ├── app.ts                  # The main application class
│   ├── config.ts               # Parses CLI args and env vars into an AppConfig object
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
├── types.ts                    # Shared types
└── utils.ts                    # Shared utility
static/             
├── .well-known/    
│   ├── llms.txt                # An example llms.txt giving LLMs information about the server    
│   └── openapi.yaml            # An example OpenAPI specification for the server 
└── dxt-manifest.json           # The manifest for the DXT package
```

## Code Style Guidelines

Deno: This project uses Deno exclusively. Follow Deno standards and best practice.
Imports: Use JSR imports (`jsr:`) or npm imports (`npm:`) with explicit paths. ES module style, include `.ts` extension. Group imports logically.
Structure: The entrypoint is `main.ts`. Core functionality is in `src/`. `src/app` wraps the MCP server from `src/mcp` in some convenience functions for serving HTTP, logging, etc.
TypeScript: Strict type checking, ES modules, explicit return types
Naming: PascalCase for classes/types, camelCase for functions/variables
Files: Lowercase with hyphens, test files with .test.ts suffix
Error Handling: Use TypeScript's strict mode, explicit error checking in tests
Formatting: 2-space indentation, semicolons required, single quotes preferred
Testing: Locate tests in `test/`, use descriptive test names. We use `deno test` for testing.
Comments: JSDoc for public APIs, inline comments for complex logic

## Best Practices

Environment Variables: env vars are loading in `main.ts` using `@std/dotenv/load` in the top-level
File Paths: Use `@std/path` for cross-platform file path handling
Data Validation: Use `zod` schemas for data validation
HTTP Responses: Return proper status codes and structured JSON responses, including JSONRPC when necessary.
Transactions: Use `kv.atomic()` for Deno KV transactions when updating multiple records
Error Handling: Provide detailed error messages but avoid exposing sensitive information
Tool Implementation: Follow the MCP schema for defining tool schemas and handlers

## Docs
