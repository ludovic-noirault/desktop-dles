/// <reference types="node" />
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Manual refresh of the bundled filter lists. They are embedded in the binary
// with include_str!, so nothing downloads them at runtime or in the release
// workflow.
const LISTS: [file: string, url: string][] = [
  ["easylist.txt", "https://easylist.to/easylist/easylist.txt"],
  ["easyprivacy.txt", "https://easylist.to/easylist/easyprivacy.txt"],
  [
    "easylist-cookie.txt",
    "https://secure.fanboy.co.nz/fanboy-cookiemonster.txt",
  ],
];

const OUT_DIR = join(import.meta.dirname, "..", "src-tauri", "filters");

async function download(file: string, url: string): Promise<[string, string]> {
  const response = await fetch(url);
  if (response.status !== 200) {
    throw new Error(`${url} answered ${response.status}`);
  }
  const body = await response.text();
  if (!body.startsWith("[Adblock Plus")) {
    throw new Error(`${url} is not an Adblock Plus list`);
  }
  return [file, body];
}

async function main(): Promise<number> {
  try {
    // Nothing is written until every list has been checked, so a failure never
    // leaves the directory half updated.
    const lists = await Promise.all(LISTS.map(([f, u]) => download(f, u)));
    // Digits, T and Z only: the stamp ends up in a WebKit content rule list
    // identifier.
    const version = new Date().toISOString().replace(/[-:]|\.\d+/g, "");
    mkdirSync(OUT_DIR, { recursive: true });
    for (const [file, body] of lists) {
      writeFileSync(join(OUT_DIR, file), body);
    }
    writeFileSync(join(OUT_DIR, "version.txt"), `${version}\n`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await main());
}
