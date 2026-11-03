/// <reference types="node" />
import { readFileSync } from "node:fs";

export type BranchType =
  | "feat"
  | "fix"
  | "docs"
  | "chore"
  | "refactor"
  | "test"
  | "ci";

const BRANCH =
  /^(feat|fix|docs|chore|refactor|test|ci)\/[a-z0-9][a-z0-9._/-]*$/;
const TAG = /^v(\d+)\.(\d+)\.(\d+)$/;

export function branchType(ref: string): BranchType | null {
  const match = BRANCH.exec(ref);
  return match ? (match[1] as BranchType) : null;
}

export function nextVersion(type: BranchType, tags: string[]): string | null {
  if (type !== "feat" && type !== "fix") return null;
  let latest = [0, 1, 0];
  for (const tag of tags) {
    const match = TAG.exec(tag);
    if (!match) continue;
    const version = match.slice(1).map(Number);
    const firstDiff = version.findIndex((n, i) => n !== latest[i]);
    if (firstDiff !== -1 && version[firstDiff] > latest[firstDiff])
      latest = version;
  }
  const [major, minor, patch] = latest;
  return type === "feat"
    ? `${major}.${minor + 1}.0`
    : `${major}.${minor}.${patch + 1}`;
}

function main(command: string | undefined, ref: string | undefined): number {
  const type = branchType(ref ?? "");
  if (!type) {
    console.error(
      `Branch "${ref ?? ""}" must be <type>/<name>, with type one of: feat, fix, docs, chore, refactor, test, ci`,
    );
    return 1;
  }
  if (command === "next-version") {
    const tags = readFileSync(0, "utf8").split("\n");
    console.log(nextVersion(type, tags) ?? "");
  }
  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv[2], process.argv[3]));
}
