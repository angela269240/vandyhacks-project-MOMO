#!/usr/bin/env node
// Create a session handoff file: node claude/new-session.mjs "<goal>" [--claim <glob>]... [--continues <id>] [--model <id>]
// Prints the new file's path. Edit the file directly afterwards; see claude/schema/session.schema.json.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const git = (...args) => {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};

const args = process.argv.slice(2);
const claims = [];
let continues = null;
let model = process.env.CLAUDE_MODEL ?? "";
const goalParts = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--claim") claims.push(args[++i]);
  else if (args[i] === "--continues") continues = args[++i];
  else if (args[i] === "--model") model = args[++i];
  else goalParts.push(args[i]);
}
const goal = goalParts.join(" ").trim();
if (!goal) {
  console.error('usage: node claude/new-session.mjs "<goal>" [--claim <glob>]... [--continues <id>] [--model <id>]');
  process.exit(1);
}

const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const branch = git("rev-parse", "--abbrev-ref", "HEAD") || "unknown";
const id = `${stamp}-${branch.replace(/[^A-Za-z0-9._-]+/g, "-")}-${randomBytes(2).toString("hex")}`;
// a linked worktree has its own git dir, separate from the shared common dir
const inWorktree = git("rev-parse", "--absolute-git-dir") !== git("rev-parse", "--path-format=absolute", "--git-common-dir");
const top = git("rev-parse", "--show-toplevel");

const session = {
  id,
  continues,
  agent: "claude-code",
  model,
  // strip stray quotes some configs carry (e.g. “name”)
  human: git("config", "user.name").replace(/^["'\u201c\u201d]+|["'\u201c\u201d]+$/g, ""),
  branch,
  base: git("rev-parse", "--short", "HEAD"),
  ...(inWorktree ? { worktree: top } : {}),
  started: now.toISOString(),
  ended: null,
  status: "active",
  goal,
  summary: "",
  claims,
  files_touched: [],
  commits: [],
  uncommitted: false,
  decisions: [],
  verification: { typecheck: "not run", lint: "not run", build: "not run", manual: "not run" },
  next_steps: [],
  open_questions: [],
  blockers: [],
  conflict_notes: [],
};

const rel = `claude/sessions/${id}.json`;
mkdirSync(join(ROOT, "claude/sessions"), { recursive: true });
writeFileSync(join(ROOT, rel), JSON.stringify(session, null, 2) + "\n", { flag: "wx" });
console.log(rel);
