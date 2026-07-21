import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
	HostTestError,
	buildFixtureFiles,
	parseFixtureSpec,
	parseVaultsVerbose,
	resolveVaultPath,
	validateSetupTarget,
} from "../.agents/skills/obsidian-host-test/scripts/host-test-lib.mjs";
const fixtureSpecJson: unknown = JSON.parse(readFileSync(resolve("tests/fixtures/host-vault/scenarios.json"), "utf8"));

describe("Obsidian host tooling contracts", () => {
	it("validates the tracked scenario matrix and derives every expected total", () => {
		const spec = parseFixtureSpec(fixtureSpecJson);
		expect(spec.scenarios.map((scenario) => scenario.id)).toEqual([
			"grouped",
			"empty",
			"single",
			"exact",
			"limit",
			"values",
			"legacy",
			"page-1",
			"page-37",
			"page-50",
			"page-100",
			"page-1000",
		]);
		expect(spec.scenarios.find((scenario) => scenario.id === "limit")).toMatchObject({
			expectedTotal: 7,
			expectedPages: 1,
		});
		expect(spec.scenarios.find((scenario) => scenario.id === "page-1000")).toMatchObject({
			expectedTotal: 1200,
			expectedPages: 2,
		});
	});

	it("builds a deterministic fixture with scenario-owned bases, embeds, values, and large data", () => {
		const spec = parseFixtureSpec(fixtureSpecJson);
		const first = buildFixtureFiles(spec);
		const second = buildFixtureFiles(spec);
		const limitBase = first.get("Bases/Limit.base") ?? "";

		expect([...first]).toEqual([...second]);
		expect(first.size).toBeGreaterThan(1_300);
		expect(limitBase).toContain("limit: 7");
		expect(limitBase.indexOf("limit: 7")).toBeLessThan(limitBase.indexOf('pageSize: "10"'));
		expect(first.get("Bases/Legacy.base")).toContain('pageSize: "12.5"');
		expect(first.get("Bases/Grouped.base")).toContain("name: Grouped pagination");
		expect(first.get("Bases/Grouped.base")).not.toContain('name: "Grouped pagination"');
		expect(first.get("Generated/values/Values 0001.md")).toContain("flag: false");
		expect(first.get("Generated/values/Values 0001.md")).toContain("zero: 0");
		expect(first.get("Embeds/Grouped.md")).toContain("![[Bases/Grouped.base#Grouped pagination]]");
	});

	it("rejects fixture identifiers and view metadata that could escape YAML or path boundaries", () => {
		const unsafeView = JSON.parse(JSON.stringify(fixtureSpecJson)) as {
			scenarios: Array<{ view: string }>;
		};
		const firstScenario = unsafeView.scenarios[0];
		if (!firstScenario) throw new Error("fixture has no first scenario");
		firstScenario.view = "Unsafe\nlimit: 1";
		expect(() => parseFixtureSpec(unsafeView)).toThrow(/invalid view name/i);

		const unsafeSet = JSON.parse(JSON.stringify(fixtureSpecJson)) as {
			sets: Array<{ id: string }>;
		};
		const firstSet = unsafeSet.sets[0];
		if (!firstSet) throw new Error("fixture has no first set");
		firstSet.id = "../escape";
		expect(() => parseFixtureSpec(unsafeSet)).toThrow(/invalid set id/i);
	});

	it("resolves a target vault through eval when the advertised vault command flakes", async () => {
		const runTarget = vi
			.fn()
			.mockRejectedValueOnce(new HostTestError("vault-resolve", 'Command "vault" not found'))
			.mockResolvedValueOnce('eval code => "C:\\\\Vaults\\\\obsidian-test-vault"');
		const runGlobal = vi.fn();

		await expect(resolveVaultPath("obsidian-test-vault", runTarget, runGlobal)).resolves.toBe(
			"C:\\Vaults\\obsidian-test-vault"
		);
		expect(runGlobal).not.toHaveBeenCalled();
	});

	it("falls back to the exact vaults-verbose row without substring matches", async () => {
		const verbose = "obsidian-test-vault-old\tC:\\Vaults\\old\nobsidian-test-vault\tC:\\Vaults\\current";
		const runTarget = vi.fn().mockRejectedValue(new HostTestError("vault-resolve", "unavailable"));
		const runGlobal = vi.fn().mockResolvedValue(verbose);

		await expect(resolveVaultPath("obsidian-test-vault", runTarget, runGlobal)).resolves.toBe(
			"C:\\Vaults\\current"
		);
		expect(parseVaultsVerbose(verbose, "obsidian-test-vault")).toBe("C:\\Vaults\\current");
	});

	it("refuses primary-looking targets and unmarked existing content unless adoption is explicit", () => {
		expect(() => validateSetupTarget("C:\\Vaults\\Personal", { exists: false })).toThrow(/disposable/i);
		expect(() =>
			validateSetupTarget("C:\\Vaults\\paginator-test", {
				exists: true,
				hasMarker: false,
				hasContent: true,
			})
		).toThrow(/--adopt/);
		expect(() =>
			validateSetupTarget("C:\\Vaults\\paginator-test", {
				adopt: true,
				exists: true,
				hasMarker: false,
				hasContent: true,
			})
		).not.toThrow();
	});
});
