#!/usr/bin/env -S deno run -A

/**
 * @description Clean the dist directory
 * @author      P. Hughes <github@phugh.es>
 * @license     MIT
 * @module
 */

await Deno.remove("./dist", { recursive: true });
