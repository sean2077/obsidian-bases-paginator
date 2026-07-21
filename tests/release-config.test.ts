import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const releaseWorkflow = readFileSync(resolve(".github/workflows/release.yml"), "utf8");
const packageManifest = readFileSync(resolve("package.json"), "utf8");

describe("release tooling contracts", () => {
	it("publishes only from a pushed version tag", () => {
		expect(releaseWorkflow).toMatch(/push:\s+tags:/);
		expect(releaseWorkflow).not.toContain("workflow_run:");
		expect(releaseWorkflow).not.toContain("semantic-release");
		expect(existsSync(resolve(".releaserc.yml"))).toBe(false);
	});

	it("fails closed on the committed snapshot and uses its extracted notes", () => {
		expect(releaseWorkflow).toContain("scripts/release/verify.mjs");
		expect(releaseWorkflow).toContain("--require-tag");
		expect(releaseWorkflow).toContain("--notes-output");
		expect(releaseWorkflow).toContain('--notes-file "$RUNNER_TEMP/release-notes.md"');
		expect(releaseWorkflow).toContain("git merge-base --is-ancestor");
		expect(releaseWorkflow.indexOf("git merge-base --is-ancestor")).toBeLessThan(
			releaseWorkflow.indexOf('node scripts/release/verify.mjs "$TAG_NAME"')
		);
	});

	it("keeps local mutation separate from CI publication", () => {
		expect(packageManifest).toContain('"release:bump": "node scripts/release/bump.mjs"');
		expect(packageManifest).toContain('"release:verify": "node scripts/release/verify.mjs"');
		expect(releaseWorkflow).toContain('gh release create "$TAG_NAME"');
		expect(releaseWorkflow).toContain("main.js manifest.json styles.css");
		expect(releaseWorkflow).toContain("actions/attest@v4");
	});
});
