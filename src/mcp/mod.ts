import { handleGetPromptsRequest, handleListPromptsRequest } from "./prompts/mod.ts";
import {
  handleListResourcesRequest,
  handleListResourceTemplatesRequest,
  handleReadResourceRequest,
} from "./resources/mod.ts";
import { handleCallToolRequest, handleListToolsRequest } from "./tools/mod.ts";

export {
  handleCallToolRequest,
  handleGetPromptsRequest,
  handleListPromptsRequest,
  handleListResourcesRequest,
  handleListResourceTemplatesRequest,
  handleListToolsRequest,
  handleReadResourceRequest,
};
