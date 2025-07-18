/**
 * @description Zod validation schemas for resource validation
 * @module
 */

import { z } from "zod/v4";

// Resource schemas
export const ResourceUriSchema = z.string().url("Invalid resource URI");
