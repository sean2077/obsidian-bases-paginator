#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { assertVersionAlignment, extractReleaseNotes, parseReleaseVersion, readReleaseSnapshot } from "./shared.mjs";

const USAGE = `Usage: node scripts/release/verify.mjs <exact-tag> [--require-tag] [--notes-output <path>]

Verify that all version mirrors and the newest CHANGELOG.md section match the repository's
complete unprefixed SemVer tag. With --require-tag, also require an annotated tag at HEAD.`;

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
	console.log(USAGE);
	process.exit(0);
}

try {
	verifyRelease(args);
} catch (error) {
	fail(error instanceof Error ? error.message : String(error));
}

function verifyRelease(cliArgs) {
	const requireTag = cliArgs.includes("--require-tag");
	const notesOutputIndex = cliArgs.indexOf("--notes-output");
	let notesOutput = null;
	if (notesOutputIndex !== -1) {
		notesOutput = cliArgs[notesOutputIndex + 1];
		if (!notesOutput) throw new Error("--notes-output requires a path.");
	}

	const consumedIndexes = new Set();
	const requireTagIndex = cliArgs.indexOf("--require-tag");
	if (requireTagIndex !== -1) consumedIndexes.add(requireTagIndex);
	if (notesOutputIndex !== -1) {
		consumedIndexes.add(notesOutputIndex);
		consumedIndexes.add(notesOutputIndex + 1);
	}
	const positional = cliArgs.filter((_arg, index) => !consumedIndexes.has(index));
	if (positional.length !== 1) throw new Error(USAGE);

	const exactTag = positional[0];
	parseReleaseVersion(exactTag);

	const root = process.cwd();
	const changelogPath = resolve(root, "CHANGELOG.md");
	assertVersionAlignment(readReleaseSnapshot(root), exactTag);
	const notes = extractReleaseNotes(readFileSync(changelogPath, "utf8"), exactTag);

	if (requireTag) assertAnnotatedTagAtHead(root, exactTag);

	if (notesOutput) {
		const outputPath = resolve(notesOutput);
		writeNotesAtomically(changelogPath, outputPath, notes);
		console.error(`Verified release ${exactTag}; wrote notes to ${outputPath}.`);
	} else {
		process.stdout.write(notes);
	}
}

function writeNotesAtomically(changelogPath, outputPath, notes) {
	const comparableChangelog = process.platform === "win32" ? changelogPath.toLowerCase() : changelogPath;
	const comparableOutput = process.platform === "win32" ? outputPath.toLowerCase() : outputPath;
	if (comparableChangelog === comparableOutput) {
		throw new Error("The release-notes output must not overwrite CHANGELOG.md.");
	}

	const parent = dirname(outputPath);
	let parentStats;
	try {
		parentStats = statSync(parent);
	} catch {
		throw new Error(`Release-notes output directory does not exist: ${parent}`);
	}
	if (!parentStats.isDirectory()) {
		throw new Error(`Release-notes output parent is not a directory: ${parent}`);
	}

	const temporaryPath = join(parent, `.${basename(outputPath)}.${randomUUID()}.tmp`);
	try {
		writeFileSync(temporaryPath, notes, { encoding: "utf8", flag: "wx" });
		renameSync(temporaryPath, outputPath);
	} finally {
		if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
	}
}

function assertAnnotatedTagAtHead(cwd, tag) {
	const type = runGit(cwd, ["cat-file", "-t", `refs/tags/${tag}`]).stdout.trim();
	if (type !== "tag") {
		throw new Error(`Tag ${tag} must be annotated; found object type ${type}.`);
	}

	const tagCommit = runGit(cwd, ["rev-parse", `refs/tags/${tag}^{commit}`]).stdout.trim();
	const headCommit = runGit(cwd, ["rev-parse", "HEAD"]).stdout.trim();
	if (tagCommit !== headCommit) {
		throw new Error(`Tag ${tag} points to ${tagCommit}, but HEAD is ${headCommit}.`);
	}
}

function runGit(cwd, gitArgs) {
	const result = spawnSync("git", gitArgs, { cwd, encoding: "utf8" });
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(result.stderr.trim() || `git ${gitArgs[0]} exited with status ${result.status}.`);
	}
	return result;
}

function fail(message) {
	console.error(`error: ${message}`);
	process.exit(1);
}
