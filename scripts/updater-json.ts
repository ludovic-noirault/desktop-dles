/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type SignedAsset = { name: string; signature: string };

type Platform = "darwin-aarch64" | "windows-x86_64";
export type UpdaterJson = {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<Platform, { signature: string; url: string }>;
};

// GitHub turns spaces in asset names into dots, so these suffixes are what is
// left of the bundle names once uploaded.
const SUFFIXES: [Platform, string][] = [
  ["darwin-aarch64", ".app.tar.gz.sig"],
  ["windows-x86_64", "-setup.exe.sig"],
];

export function buildUpdaterJson(input: {
  version: string;
  notes: string;
  pubDate: string;
  repo: string;
  assets: SignedAsset[];
  // Names of the files actually uploaded to the release: a signature without
  // its archive would publish a manifest that points at a 404.
  assetNames: string[];
}): UpdaterJson {
  const platforms: Partial<UpdaterJson["platforms"]> = {};
  for (const [platform, suffix] of SUFFIXES) {
    const matches = input.assets.filter((a) => a.name.endsWith(suffix));
    if (matches.length !== 1) {
      throw new Error(
        `Expected one "*${suffix}" signature for ${platform}, found ${matches.length}`,
      );
    }
    const [{ name, signature }] = matches;
    const archive = name.slice(0, -".sig".length);
    if (!input.assetNames.includes(archive)) {
      throw new Error(
        `Release asset "${archive}" for ${platform} is missing from the uploaded assets`,
      );
    }
    const file = encodeURIComponent(archive);
    platforms[platform] = {
      signature,
      url: `https://github.com/${input.repo}/releases/download/v${input.version}/${file}`,
    };
  }
  return {
    version: input.version,
    notes: input.notes,
    pub_date: input.pubDate,
    platforms: platforms as UpdaterJson["platforms"],
  };
}

function main(dir: string | undefined, version: string | undefined): number {
  const repo = process.env.REPO;
  const assetNames = process.env.ASSETS?.split("\n").filter(Boolean);
  if (!dir || !version || !repo || !assetNames?.length) {
    console.error(
      "Usage: REPO=<owner/repo> ASSETS=<newline-separated asset names> [NOTES=...] node scripts/updater-json.ts <sig-dir> <version>",
    );
    return 1;
  }
  try {
    const assets = readdirSync(dir)
      .filter((name) => name.endsWith(".sig"))
      .map((name) => ({
        name,
        signature: readFileSync(join(dir, name), "utf8").trim(),
      }));
    const json = buildUpdaterJson({
      version,
      notes: process.env.NOTES ?? "",
      pubDate: new Date().toISOString(),
      repo,
      assets,
      assetNames,
    });
    console.log(JSON.stringify(json, null, 2));
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv[2], process.argv[3]));
}
