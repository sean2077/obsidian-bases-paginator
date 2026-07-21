#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

import {
	RELEASE_FILE_NAMES,
	assertVersionAlignment,
	compareReleaseVersions,
	formatJson,
	parseReleaseVersion,
	readReleaseSnapshot,
	replaceSourceVersion,
} from "./shared.mjs";

const USAGE = `Usage: node scripts/release/bump.mjs <version> [--dry-run]

Synchronize the repository's release version files. The version must be newer than the
current version and must not include a leading v. This command does not edit CHANGELOG.md,
commit, tag, or push.`;

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
	console.log(USAGE);
	process.exit(0);
}

const dryRun = args.includes("--dry-run");
const positional = args.filter((arg) => arg !== "--dry-run");
if (positional.length !== 1) fail(USAGE);

const targetVersion = positional[0];
parseReleaseVersion(targetVersion);

const root = process.cwd();
const snapshot = readReleaseSnapshot(root);
assertVersionAlignment(snapshot);

const currentVersion = snapshot.packageJson.version;
if (compareReleaseVersions(targetVersion, currentVersion) <= 0) {
	fail(`Target ${targetVersion} must be newer than current version ${currentVersion}.`);
}

assertCleanWorktree(root);
assertTagAvailable(root, targetVersion);

if (dryRun) {
	console.log(`Would bump ${currentVersion} -> ${targetVersion}.`);
	console.log(`Would update: ${RELEASE_FILE_NAMES.join(", ")}.`);
	process.exit(0);
}

const originals = new Map(
	RELEASE_FILE_NAMES.map((file) => [snapshot.paths[file], readFileSync(snapshot.paths[file], "utf8")])
);

try {
	const npmArgs = ["version", targetVersion, "--no-git-tag-version", "--ignore-scripts"];
	const npmExecPath = process.env.npm_execpath;
	const npmResult = npmExecPath
		? spawnSync(process.execPath, [npmExecPath, ...npmArgs], {
				cwd: root,
				stdio: "inherit",
			})
		: spawnSync("npm", npmArgs, {
				cwd: root,
				stdio: "inherit",
			});
	if (npmResult.error) throw npmResult.error;
	if (npmResult.status !== 0) {
		throw new Error(`npm version exited with status ${npmResult.status}.`);
	}

	const manifest = { ...snapshot.manifest, version: targetVersion };
	const versions = {
		...snapshot.versions,
		[targetVersion]: snapshot.manifest.minAppVersion,
	};

	writeFileSync(snapshot.paths["manifest.json"], formatJson(manifest));
	writeFileSync(snapshot.paths["versions.json"], formatJson(versions));
	writeFileSync(snapshot.paths["src/version.ts"], replaceSourceVersion(snapshot.versionSource, targetVersion));

	assertVersionAlignment(readReleaseSnapshot(root), targetVersion);
} catch (error) {
	for (const [path, contents] of originals) writeFileSync(path, contents);
	fail(`Version bump rolled back: ${error instanceof Error ? error.message : String(error)}`);
}

console.log(`Bumped ${currentVersion} -> ${targetVersion}.`);
console.log(
	`Next: add the ${targetVersion} section to CHANGELOG.md and run npm run release:verify -- ${targetVersion}.`
);

function assertCleanWorktree(cwd) {
	const result = runGit(cwd, ["status", "--porcelain", "--untracked-files=all"]);
	if (result.stdout.trim().length !== 0) {
		fail("Release version bump requires a clean worktree.");
	}
}

function assertTagAvailable(cwd, version) {
	const result = spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/tags/${version}`], {
		cwd,
		encoding: "utf8",
	});
	if (result.error) fail(result.error.message);
	if (result.status === 0) fail(`Tag ${version} already exists; tags are immutable.`);
	if (result.status !== 1) fail(`Could not check tag ${version}; git exited with status ${result.status}.`);
}

function runGit(cwd, gitArgs) {
	const result = spawnSync("git", gitArgs, { cwd, encoding: "utf8" });
	if (result.error) fail(result.error.message);
	if (result.status !== 0) {
		fail(result.stderr.trim() || `git ${gitArgs[0]} exited with status ${result.status}.`);
	}
	return result;
}

function fail(message) {
	console.error(message);
	process.exit(1);
}
