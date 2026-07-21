#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import {
	FIXTURE_MARKER,
	assertHost,
	buildFixtureFiles,
	isWithin,
	parseJson,
	readFixtureSpec,
	validateSetupTarget,
} from "./host-test-lib.mjs";

const USAGE = `Usage:
  npm run test:host:setup -- --target <disposable-vault-path> [--spec <scenarios.json>] [--adopt]

Creates or refreshes only files owned by the tracked Bases Paginator host fixture.
The target directory name must contain test, qa, sandbox, or disposable. Existing
unmarked content is preserved and requires the explicit --adopt acknowledgement.`;

function parseArguments(argv) {
	const values = new Map();
	let adopt = false;
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (token === "--help" || token === "-h") return { adopt, help: true, values };
		if (token === "--adopt") {
			adopt = true;
			continue;
		}
		assertHost("arguments", token === "--target" || token === "--spec", `unknown option: ${token}`);
		const value = argv[index + 1];
		assertHost("arguments", value && !value.startsWith("--"), `${token} requires a value`);
		values.set(token.slice(2), value);
		index += 1;
	}
	return { adopt, help: false, values };
}

async function pathState(target, markerPath) {
	if (!existsSync(target)) return { exists: false, hasContent: false, hasMarker: false };
	assertHost("target", (await stat(target)).isDirectory(), `target is not a directory: ${target}`);
	const entries = await readdir(target);
	return {
		exists: true,
		hasContent: entries.some((entry) => entry !== FIXTURE_MARKER),
		hasMarker: existsSync(markerPath),
	};
}

async function main() {
	const parsed = parseArguments(process.argv.slice(2));
	if (parsed.help) {
		console.log(USAGE);
		return;
	}
	const targetValue = parsed.values.get("target")?.trim();
	assertHost("arguments", targetValue, `--target is required\n${USAGE}`);
	const root = process.cwd();
	const specPath = resolve(root, parsed.values.get("spec") ?? "tests/fixtures/host-vault/scenarios.json");
	assertHost(
		"fixture-spec",
		isWithin(root, specPath) && existsSync(specPath),
		`fixture specification is missing or escapes the repository: ${specPath}`
	);
	const spec = await readFixtureSpec(specPath);
	const provisionalTarget = resolve(root, targetValue);
	const markerPath = join(provisionalTarget, FIXTURE_MARKER);
	const state = await pathState(provisionalTarget, markerPath);
	const target = validateSetupTarget(provisionalTarget, { ...state, adopt: parsed.adopt });
	let previousMarker;
	if (state.hasMarker) {
		previousMarker = parseJson("fixture-marker", await readFile(markerPath, "utf8"));
		assertHost(
			"fixture-marker",
			previousMarker.fixtureId === spec.fixtureId,
			`target belongs to fixture '${String(previousMarker.fixtureId)}', expected '${spec.fixtureId}'`
		);
		assertHost(
			"fixture-marker",
			Array.isArray(previousMarker.generatedFiles),
			"fixture marker has no generatedFiles list"
		);
	}

	await mkdir(target, { recursive: true });
	const files = buildFixtureFiles(spec);
	const generatedFiles = [...files.keys()].sort();
	for (const stalePath of previousMarker?.generatedFiles ?? []) {
		if (generatedFiles.includes(stalePath)) continue;
		const absolute = resolve(target, stalePath);
		assertHost("fixture-marker", isWithin(target, absolute), `stale path escapes target: ${stalePath}`);
		try {
			await unlink(absolute);
		} catch (error) {
			if (!(error instanceof Error) || !Reflect.has(error, "code") || error.code !== "ENOENT") throw error;
		}
	}
	for (const [relativePath, content] of files) {
		const absolute = resolve(target, relativePath);
		assertHost("fixture-write", isWithin(target, absolute), `generated path escapes target: ${relativePath}`);
		await mkdir(dirname(absolute), { recursive: true });
		await writeFile(absolute, content, "utf8");
	}
	await writeFile(
		markerPath,
		`${JSON.stringify(
			{
				fixtureId: spec.fixtureId,
				generatedFiles,
				scenarioCount: spec.scenarios.length,
				version: spec.version,
			},
			null,
			2
		)}\n`,
		"utf8"
	);
	console.log(
		JSON.stringify(
			{
				adopted: state.hasContent && !state.hasMarker,
				fixtureId: spec.fixtureId,
				generatedFiles: generatedFiles.length,
				next: `Open '${target}' as an Obsidian vault once if it is not already registered.`,
				scenarios: spec.scenarios.length,
				status: "ready",
				target,
			},
			null,
			2
		)
	);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
