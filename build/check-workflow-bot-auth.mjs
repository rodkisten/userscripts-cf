import fs from "node:fs";
import path from "node:path";

const directory = ".github/workflows";
const errors = [];
for (const file of fs.readdirSync(directory).filter((name) => /\.ya?ml$/.test(name))) {
  const source = fs.readFileSync(path.join(directory, file), "utf8");
  const writesGit = /\bgit\s+(?:commit|push|merge)\b|create-pull-request@|\bgh\s+pr\s+create\b/.test(source);
  if (!writesGit) continue;
  if (!source.includes("actions/create-github-app-token@")) {
    errors.push(`${file}: GitHub App token action missing`);
  }
  if (!source.includes("steps.app-token.outputs.token")) {
    errors.push(`${file}: GitHub App token not used for authenticated writes`);
  }
  if (/git config user\.name ["']github-actions\[bot\]/.test(source)) {
    errors.push(`${file}: GitHub Actions bot used as commit author`);
  }
}
if (errors.length) {
  for (const error of errors) console.error(`::error::${error}`);
  process.exitCode = 1;
} else {
  console.log("All commit-capable workflows require Rod GitHub App authentication.");
}
