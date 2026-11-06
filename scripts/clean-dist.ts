#!/usr/bin/env -S deno run --allow-read=dist --allow-write=dist

/**
 * @description Clean the dist directory
 * @author      P. Hughes <github@phugh.es>
 * @license     MIT
 * @module
 */

await Deno.remove("./dist", { recursive: true }).catch((error) => {
  if (!(error instanceof Deno.errors.NotFound)) throw error;
});
