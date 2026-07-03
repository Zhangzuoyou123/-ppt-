#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");

const args = new Set(process.argv.slice(2));
const rawArgs = process.argv.slice(2);

function valueOf(flag) {
  const index = rawArgs.indexOf(flag);
  return index >= 0 ? rawArgs[index + 1] : "";
}

function usage() {
  console.log(`
Chaoxing PPT Crawler Skill installer

Usage:
  npx github:Zhangzuoyou123/-ppt- --all
  npx github:Zhangzuoyou123/-ppt- --codex
  npx github:Zhangzuoyou123/-ppt- --claude
  npx github:Zhangzuoyou123/-ppt- --dest <skills-dir>

Options:
  --all       Install to Codex and Claude skill directories.
  --codex     Install to Codex only.
  --claude    Install to Claude only.
  --dest DIR  Install into a custom skills directory.
  --force     Replace an existing installed skill.
  --help      Show this help.
`);
}

if (args.has("--help") || args.has("-h")) {
  usage();
  process.exit(0);
}

const repoRoot = path.resolve(__dirname, "..");
const sourceSkill = path.join(repoRoot, "skills", "chaoxing-ppt-crawler");
const skillName = "chaoxing-ppt-crawler";

function codexSkillsDir() {
  if (process.env.CODEX_HOME) return path.join(process.env.CODEX_HOME, "skills");
  return path.join(os.homedir(), ".codex", "skills");
}

function claudeSkillsDir() {
  if (process.env.CLAUDE_SKILLS_DIR) return process.env.CLAUDE_SKILLS_DIR;
  return path.join(os.homedir(), ".claude", "skills");
}

function copyDir(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (fs.existsSync(dst)) {
    if (!args.has("--force")) {
      console.log(`Skip existing: ${dst}`);
      console.log("Use --force to replace it.");
      return;
    }
    fs.rmSync(dst, { recursive: true, force: true });
  }
  fs.cpSync(src, dst, { recursive: true });
  console.log(`Installed: ${dst}`);
}

if (!fs.existsSync(path.join(sourceSkill, "SKILL.md"))) {
  console.error(`Missing skill source: ${sourceSkill}`);
  process.exit(1);
}

const targets = [];
const customDest = valueOf("--dest");

if (customDest) {
  targets.push(path.resolve(customDest));
} else {
  const installAll = args.has("--all") || (!args.has("--codex") && !args.has("--claude"));
  if (installAll || args.has("--codex")) targets.push(codexSkillsDir());
  if (installAll || args.has("--claude")) targets.push(claudeSkillsDir());
}

for (const target of targets) {
  copyDir(sourceSkill, path.join(target, skillName));
}

console.log("Done.");
