import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const bumpScript = resolve("scripts/release/bump.mjs");
const verifyScript = resolve("scripts/release/verify.mjs");
const fixtures: string[] = [];

afterEach(() => {
	for (const fixture of fixtures.splice(0)) {
		rmSync(fixture, { recursive: true, force: true });
	}
});

describe("release scripts", () => {
	it("extracts the newest matching Changelog section", () => {
		const fixture = createFixture();
		const notesPath = join(fixture, "release-notes.md");
		writeFileSync(notesPath, "stale notes\n");
		const result = runNode(verifyScript, ["2.0.2", "--notes-output", notesPath], fixture);

		expect(result.status, result.stderr).toBe(0);
		expect(readFileSync(notesPath, "utf8")).toBe("### Fixed\n\n- Deterministic release notes.\n");
	});

	it("compares the published release body from JSON without CLI display newlines", () => {
		const fixture = createFixture();
		const releasePath = join(fixture, "published-release.json");
		const notes = "### Fixed\n\n- Deterministic release notes.\n";
		writeJson(releasePath, { body: notes });

		const exact = runNode(verifyScript, ["2.0.2", "--published-release-json", releasePath], fixture);
		expect(exact.status, exact.stderr).toBe(0);

		writeJson(releasePath, { body: `${notes}\n` });
		const extraNewline = runNode(verifyScript, ["2.0.2", "--published-release-json", releasePath], fixture);
		expect(extraNewline.status).toBe(1);
		expect(extraNewline.stderr).toContain("does not exactly match");
	});

	it("ignores matching headings inside fenced code blocks", () => {
		const fixture = createFixture(`\uFEFF## [2.0.2](https://example.test/compare/2.0.1...2.0.2) (2026-07-21)

### Fixed

- Deterministic release notes.

\`\`\`markdown
## [2.0.2] malformed duplicate
\`\`\`

## [2.0.1](https://example.test/compare/2.0.0...2.0.1) (2026-07-20)

- Previous release.
`);
		const result = runNode(verifyScript, ["2.0.2"], fixture);

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain("malformed duplicate");
	});

	it("rejects version drift and an empty Changelog section", () => {
		const drifted = createFixture();
		const driftedManifest = readJsonObject(join(drifted, "manifest.json"));
		driftedManifest.version = "2.0.1";
		writeJson(join(drifted, "manifest.json"), driftedManifest);

		const driftResult = runNode(verifyScript, ["2.0.2"], drifted);
		expect(driftResult.status).toBe(1);
		expect(driftResult.stderr).toContain("manifest.json has version");

		const empty = createFixture("## [2.0.2](https://example.test/compare/2.0.1...2.0.2) (2026-07-21)\n");
		const emptyResult = runNode(verifyScript, ["2.0.2"], empty);
		expect(emptyResult.status).toBe(1);
		expect(emptyResult.stderr).toContain("has no release notes");
	});

	it("rejects invalid dates and duplicate malformed headings without replacing notes", () => {
		const invalidDate = createFixture(
			"## [2.0.2](https://example.test/compare/2.0.1...2.0.2) (2026-02-30)\n\n- Invalid.\n"
		);
		const notesPath = join(invalidDate, "release-notes.md");
		writeFileSync(notesPath, "preserve me\n");
		const dateResult = runNode(verifyScript, ["2.0.2", "--notes-output", notesPath], invalidDate);
		expect(dateResult.status).toBe(1);
		expect(dateResult.stderr).toContain("invalid calendar date");
		expect(readFileSync(notesPath, "utf8")).toBe("preserve me\n");

		const duplicate = createFixture(`## [2.0.2] (2026-07-21)

- Valid body.

## [2.0.2] malformed duplicate

- Must fail.
`);
		const duplicateResult = runNode(verifyScript, ["2.0.2"], duplicate);
		expect(duplicateResult.status).toBe(1);
		expect(duplicateResult.stderr).toContain("exactly one heading");
	});

	it("previews and applies a bounded version bump without creating a tag", () => {
		const fixture = createFixture();
		const originalPackage = readFileSync(join(fixture, "package.json"), "utf8");

		const preview = runNode(bumpScript, ["2.0.3", "--dry-run"], fixture);
		expect(preview.status, preview.stderr).toBe(0);
		expect(preview.stdout).toContain("Would bump 2.0.2 -> 2.0.3");
		expect(readFileSync(join(fixture, "package.json"), "utf8")).toBe(originalPackage);

		const bump = runNode(bumpScript, ["2.0.3"], fixture);
		expect(bump.status, bump.stderr).toBe(0);
		expect(readJsonObject(join(fixture, "package.json")).version).toBe("2.0.3");
		expect(readJsonObject(join(fixture, "package-lock.json")).version).toBe("2.0.3");
		expect(readJsonObject(join(fixture, "manifest.json")).version).toBe("2.0.3");
		expect(readJsonObject(join(fixture, "versions.json"))["2.0.3"]).toBe("1.12.0");
		expect(readFileSync(join(fixture, "src/version.ts"), "utf8")).toContain('VERSION = "2.0.3"');
		expect(run("git", ["tag", "--list"], fixture).stdout).toBe("");
	}, 15_000);

	it("rejects a lightweight tag and accepts an annotated tag at HEAD", () => {
		const fixture = createFixture();
		run("git", ["tag", "2.0.2"], fixture);

		const lightweight = runNode(verifyScript, ["2.0.2", "--require-tag"], fixture);
		expect(lightweight.status).toBe(1);
		expect(lightweight.stderr).toContain("must be annotated");

		run("git", ["tag", "--delete", "2.0.2"], fixture);
		run("git", ["tag", "--annotate", "2.0.2", "--message", "2.0.2"], fixture);

		const annotated = runNode(verifyScript, ["2.0.2", "--require-tag"], fixture);
		expect(annotated.status, annotated.stderr).toBe(0);
		expect(annotated.stdout).toContain("Deterministic release notes");
	});
});

function createFixture(
	changelog = `## [2.0.2](https://example.test/compare/2.0.1...2.0.2) (2026-07-21)

### Fixed

- Deterministic release notes.

## [2.0.1](https://example.test/compare/2.0.0...2.0.1) (2026-07-20)

### Fixed

- Previous release.
`
) {
	const fixture = mkdtempSync(join(tmpdir(), "bases-paginator-release-"));
	fixtures.push(fixture);
	writeJson(join(fixture, "package.json"), {
		name: "release-fixture",
		version: "2.0.2",
		license: "0-BSD",
	});
	writeJson(join(fixture, "package-lock.json"), {
		name: "release-fixture",
		version: "2.0.2",
		lockfileVersion: 3,
		requires: true,
		packages: {
			"": {
				name: "release-fixture",
				version: "2.0.2",
				license: "0-BSD",
			},
		},
	});
	writeJson(join(fixture, "manifest.json"), {
		id: "release-fixture",
		name: "Release fixture",
		version: "2.0.2",
		minAppVersion: "1.12.0",
	});
	writeJson(join(fixture, "versions.json"), { "2.0.2": "1.12.0" });
	writeFileSync(join(fixture, "CHANGELOG.md"), changelog);
	mkdirSync(join(fixture, "src"));
	writeFileSync(join(fixture, "src/version.ts"), 'export const VERSION = "2.0.2";\n');
	run("git", ["init"], fixture);
	run("git", ["config", "user.name", "Release Test"], fixture);
	run("git", ["config", "user.email", "release-test@example.invalid"], fixture);
	run("git", ["config", "core.autocrlf", "false"], fixture);
	run("git", ["config", "core.safecrlf", "false"], fixture);
	run("git", ["add", "."], fixture);
	run("git", ["commit", "-m", "test: initialize release fixture"], fixture);
	return fixture;
}

function writeJson(path: string, value: unknown) {
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`);
}

function readJsonObject(path: string): Record<string, unknown> {
	const value: unknown = JSON.parse(readFileSync(path, "utf8"));
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${path} must contain a JSON object.`);
	}
	return value as Record<string, unknown>;
}

function runNode(script: string, args: string[], cwd: string) {
	return run(process.execPath, [script, ...args], cwd);
}

function run(command: string, args: string[], cwd: string) {
	return spawnSync(command, args, { cwd, encoding: "utf8" });
}
