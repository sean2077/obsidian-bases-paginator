import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const releaseWorkflow = readFileSync(resolve(".github/workflows/release.yml"), "utf8");
const releaseConfig = readFileSync(resolve(".releaserc.yml"), "utf8");

describe("release tooling contracts", () => {
	it("pins the compatible Conventional Commits preset and configures both consumers explicitly", () => {
		expect(releaseWorkflow).toContain("conventional-changelog-conventionalcommits@9.3.1");
		expect(releaseWorkflow).not.toMatch(/^\s+conventional-changelog-conventionalcommits\s*$/m);
		expect(releaseConfig.match(/preset: conventionalcommits/g)).toHaveLength(2);
	});

	it("keeps generated version metadata formatted before publication", () => {
		expect(releaseConfig).toContain("JSON.stringify(v, null, '\\t') + '\\n'");
		expect(releaseConfig).toContain("npm run fmt:check");
	});
});
