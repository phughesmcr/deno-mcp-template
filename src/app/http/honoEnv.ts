import type { RateLimitIdentity } from "$/app/http/rateLimitIdentity.ts";

export interface HonoBindings {
  clientIp?: string;
}

export type HonoEnv = {
  Bindings: HonoBindings;
  Variables: {
    rateLimitIdentity: RateLimitIdentity;
  };
};
