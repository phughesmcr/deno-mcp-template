import { HTTP_BAD_REQUEST_CODE, HTTP_NOT_ACCEPTABLE_CODE } from "../src/constants.ts";
import { getTransport } from "../src/transports/mod.ts";
import { getSessionId } from "../src/utils.ts";

export async function POST(req: Request): Promise<Response> {
  const acceptHeader = req.headers.get("Accept");
  if (!acceptHeader) {
    return new Response("Accept header is required", { status: HTTP_NOT_ACCEPTABLE_CODE });
  }

  const sessionId = await getSessionId(req);
  if (!sessionId) {
    return new Response("Session ID not found", { status: HTTP_BAD_REQUEST_CODE });
  }

  const transport = getTransport(sessionId);
  if (!transport) {
    return new Response("No transport found for session", { status: HTTP_BAD_REQUEST_CODE });
  }

  try {
    return await transport.handlePostMessage(req);
  } catch (error) {
    console.error(error);
    return new Response("Invalid JSON", { status: HTTP_BAD_REQUEST_CODE });
  }
}
