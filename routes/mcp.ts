import { StreamableHTTPServerTransport } from "../src/transports/mod.ts";
import { server } from "../src/mcp/mod.ts";

// Create a singleton transport for MCP
let mcpTransport: StreamableHTTPServerTransport | null = null;
// Track initialization state
let isInitializing = false;
let isInitialized = false;

/**
 * Initializes the transport once
 */
async function initializeTransport(): Promise<StreamableHTTPServerTransport | null> {
  // Prevent multiple concurrent initialization attempts
  if (isInitializing) {
    return mcpTransport;
  }

  // If already initialized successfully, just return the transport
  if (isInitialized && mcpTransport) {
    return mcpTransport;
  }

  isInitializing = true;

  try {
    // Create a new transport with the current endpoint
    const transport = new StreamableHTTPServerTransport("/mcp");

    // Connect to the server first (SDK might call start internally)
    await server.connect(transport);

    console.error("MCP transport initialized successfully");

    // Store the transport and update state flags
    mcpTransport = transport;
    isInitialized = true;
    return transport;
  } catch (error) {
    console.error("Failed to initialize MCP transport:", error);
    return null;
  } finally {
    isInitializing = false;
  }
}

/**
 * Gets the MCP transport, initializing it if necessary
 * This is safe to call multiple times
 */
async function getTransport(): Promise<StreamableHTTPServerTransport | null> {
  if (!isInitialized || !mcpTransport) {
    return await initializeTransport();
  }
  return mcpTransport;
}

/**
 * Handles all HTTP methods (GET, POST, DELETE) for the MCP endpoint
 * Delegates to the StreamableHTTPServerTransport
 */
async function handleRequest(req: Request): Promise<Response> {
  try {
    const transport = await getTransport();

    if (!transport) {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "MCP transport not initialized",
          },
          id: null,
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    return await transport.handleRequest(req);
  } catch (error) {
    console.error("Error handling MCP request:", error);

    // Provide a fallback response in case of error
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal error",
          data: String(error),
        },
        id: null,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
}

/**
 * Handles POST requests to the MCP endpoint
 */
export async function POST(req: Request) {
  return await handleRequest(req);
}

/**
 * Handles GET requests to the MCP endpoint
 */
export async function GET(req: Request) {
  return await handleRequest(req);
}

/**
 * Handles DELETE requests to the MCP endpoint
 */
export async function DELETE(req: Request) {
  return await handleRequest(req);
}
