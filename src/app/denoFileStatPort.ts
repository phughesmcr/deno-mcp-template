import type { FileStatPort } from "$/shared/config-input.ts";

/**
 * Production {@link FileStatPort} using `Deno.statSync`.
 */
export const denoFileStatPort: FileStatPort = {
  statFile(path: string) {
    try {
      const stat = Deno.statSync(path);
      if (!stat.isFile) {
        return { kind: "error", code: "not_file" };
      }
      return { kind: "file" };
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return { kind: "error", code: "not_found" };
      }
      if (error instanceof Deno.errors.PermissionDenied) {
        return { kind: "error", code: "permission_denied" };
      }
      if (error instanceof Error) {
        return { kind: "error", code: "unknown", message: error.message };
      }
      return { kind: "error", code: "unknown" };
    }
  },
};
