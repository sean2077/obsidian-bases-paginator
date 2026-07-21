import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve } from "node:path";

export const FIXTURE_MARKER = ".obsidian-host-fixture.json";
export const DISPOSABLE_VAULT_NAME = /(?:^|[-_. ])(?:test|qa|sandbox|disposable)(?:$|[-_. ])/i;

export class HostTestError extends Error {
	constructor(stage, message, options) {
		super(`[${stage}] ${message}`, options);
		this.name = "HostTestError";
		this.stage = stage;
	}
}

export class RetryableHostTestError extends HostTestError {}

export function fail(stage, message, options) {
	throw new HostTestError(stage, message, options);
}

export function assertHost(stage, condition, message) {
	if (!condition) fail(stage, message);
}

export function isWithin(parent, child) {
	const pathFromParent = relative(resolve(parent), resolve(child));
	return pathFromParent === "" || (!pathFromParent.startsWith("..") && !isAbsolute(pathFromParent));
}

export function parseJson(stage, output) {
	try {
		return JSON.parse(output);
	} catch (error) {
		fail(
			stage,
			`expected JSON output: ${error instanceof Error ? error.message : String(error)}\n${String(output).slice(0, 1000)}`
		);
	}
}

export function parseEvalJson(output, stage) {
	if (output.includes('Command "eval" not found')) {
		throw new RetryableHostTestError(stage, "Obsidian eval command is temporarily unavailable");
	}
	const marker = output.lastIndexOf("=>");
	assertHost(stage, marker >= 0, `unexpected eval output:\n${output}`);
	let parsed = parseJson(stage, output.slice(marker + 2).trim());
	if (typeof parsed === "string") parsed = parseJson(stage, parsed);
	return parsed;
}

export function parseEvalString(output, stage) {
	if (output.includes('Command "eval" not found')) {
		throw new RetryableHostTestError(stage, "Obsidian eval command is temporarily unavailable");
	}
	const marker = output.lastIndexOf("=>");
	assertHost(stage, marker >= 0, `unexpected eval output:\n${output}`);
	const value = output.slice(marker + 2).trim();
	return value.startsWith('"') ? parseJson(stage, value) : value;
}

export function parseVaultsVerbose(output, vaultName) {
	for (const line of output.split(/\r?\n/u)) {
		const separator = line.indexOf("\t");
		if (separator < 0) continue;
		const name = line.slice(0, separator).trim();
		const path = line.slice(separator + 1).trim();
		if (name === vaultName && path) return path;
	}
	return undefined;
}

export async function resolveVaultPath(vaultName, runTarget, runGlobal) {
	const failures = [];
	try {
		const direct = String(await runTarget(["vault", "info=path"], "vault-resolve-direct")).trim();
		if (direct) return direct;
		failures.push("vault info=path returned no path");
	} catch (error) {
		failures.push(error instanceof Error ? error.message : String(error));
	}

	try {
		const evaluated = parseEvalString(
			String(
				await runTarget(
					[
						"eval",
						"code=JSON.stringify(app.vault.adapter.getBasePath?.() ?? app.vault.adapter.basePath ?? '')",
					],
					"vault-resolve-eval"
				)
			),
			"vault-resolve-eval"
		).trim();
		if (evaluated) return evaluated;
		failures.push("Obsidian adapter returned no base path");
	} catch (error) {
		failures.push(error instanceof Error ? error.message : String(error));
	}

	try {
		const verbose = String(await runGlobal(["vaults", "verbose"], "vault-resolve-list"));
		const listed = parseVaultsVerbose(verbose, vaultName);
		if (listed) return listed;
		failures.push(`vaults verbose did not contain an exact '${vaultName}' row`);
	} catch (error) {
		failures.push(error instanceof Error ? error.message : String(error));
	}

	fail("vault-resolve", `could not resolve explicit vault '${vaultName}':\n- ${failures.join("\n- ")}`);
}

export function validateSetupTarget(target, options = {}) {
	const resolved = resolve(target);
	assertHost(
		"safety",
		DISPOSABLE_VAULT_NAME.test(basename(resolved)),
		`refusing target '${resolved}': its directory name must contain test, qa, sandbox, or disposable`
	);
	assertHost(
		"safety",
		basename(resolved) !== "" && resolve(resolved) !== resolve(resolved, ".."),
		"target is too broad"
	);
	if (options.exists && options.hasContent && !options.hasMarker && !options.adopt) {
		fail(
			"safety",
			`refusing unmarked non-empty target '${resolved}'; pass --adopt only after confirming it is disposable`
		);
	}
	return resolved;
}

function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/u;
const SAFE_PROPERTY_ID = /^[A-Za-z0-9_.-]+$/u;
const SAFE_VIEW_NAME = /^[A-Za-z0-9][A-Za-z0-9 _-]*$/u;

function safeFixturePath(stage, path, extension) {
	assertHost(stage, typeof path === "string" && path.length > 0, `${extension} path is missing`);
	assertHost(stage, !isAbsolute(path) && !path.split(/[\\/]/u).includes(".."), `unsafe fixture path: ${path}`);
	assertHost(stage, extname(path).toLowerCase() === extension, `expected ${extension} path, got ${path}`);
	return path.replaceAll("\\", "/");
}

export function parseFixtureSpec(value) {
	assertHost("fixture-spec", isRecord(value), "fixture specification must be an object");
	assertHost("fixture-spec", value.version === 1, `unsupported fixture version: ${String(value.version)}`);
	assertHost(
		"fixture-spec",
		typeof value.fixtureId === "string" && value.fixtureId.length > 0,
		"fixtureId is required"
	);
	assertHost("fixture-spec", Array.isArray(value.sets), "sets must be an array");
	assertHost("fixture-spec", Array.isArray(value.scenarios), "scenarios must be an array");

	const setIds = new Set();
	const sets = value.sets.map((candidate) => {
		assertHost("fixture-spec", isRecord(candidate), "each set must be an object");
		assertHost(
			"fixture-spec",
			typeof candidate.id === "string" && SAFE_ID.test(candidate.id),
			`invalid set id: ${String(candidate.id)}`
		);
		assertHost("fixture-spec", !setIds.has(candidate.id), `duplicate set id: ${candidate.id}`);
		setIds.add(candidate.id);
		assertHost(
			"fixture-spec",
			typeof candidate.tag === "string" && /^host-[a-z0-9-]+$/u.test(candidate.tag),
			`invalid set tag: ${String(candidate.tag)}`
		);
		assertHost(
			"fixture-spec",
			Number.isInteger(candidate.count) && candidate.count >= 0,
			`invalid count for set ${candidate.id}`
		);
		assertHost(
			"fixture-spec",
			["compact", "standard", "values"].includes(candidate.kind),
			`invalid kind for set ${candidate.id}`
		);
		return { id: candidate.id, tag: candidate.tag, count: candidate.count, kind: candidate.kind };
	});
	const setsById = new Map(sets.map((set) => [set.id, set]));
	const scenarioIds = new Set();
	let primaryCount = 0;
	let performanceCount = 0;

	const scenarios = value.scenarios.map((candidate) => {
		assertHost("fixture-spec", isRecord(candidate), "each scenario must be an object");
		assertHost(
			"fixture-spec",
			typeof candidate.id === "string" && SAFE_ID.test(candidate.id),
			`invalid scenario id: ${String(candidate.id)}`
		);
		assertHost("fixture-spec", !scenarioIds.has(candidate.id), `duplicate scenario id: ${candidate.id}`);
		scenarioIds.add(candidate.id);
		const set = candidate.set === undefined ? undefined : setsById.get(candidate.set);
		assertHost(
			"fixture-spec",
			candidate.set === undefined || set !== undefined,
			`unknown set '${String(candidate.set)}' for scenario ${candidate.id}`
		);
		const tag = candidate.tag ?? set?.tag;
		assertHost(
			"fixture-spec",
			typeof tag === "string" && /^host-[a-z0-9-]+$/u.test(tag),
			`invalid tag for scenario ${candidate.id}`
		);
		assertHost(
			"fixture-spec",
			Number.isInteger(candidate.pageSize) && candidate.pageSize >= 1 && candidate.pageSize <= 1000,
			`invalid pageSize for scenario ${candidate.id}`
		);
		const base = safeFixturePath("fixture-spec", candidate.base, ".base");
		const embed = safeFixturePath("fixture-spec", candidate.embed, ".md");
		assertHost(
			"fixture-spec",
			typeof candidate.view === "string" && SAFE_VIEW_NAME.test(candidate.view),
			`invalid view name for scenario ${candidate.id}`
		);
		if (candidate.groupBy !== undefined) {
			assertHost(
				"fixture-spec",
				typeof candidate.groupBy === "string" && SAFE_PROPERTY_ID.test(candidate.groupBy),
				`invalid groupBy for scenario ${candidate.id}`
			);
		}
		if (candidate.sort !== undefined) {
			assertHost(
				"fixture-spec",
				Array.isArray(candidate.sort) &&
					candidate.sort.every((property) => typeof property === "string" && SAFE_PROPERTY_ID.test(property)),
				`invalid sort for scenario ${candidate.id}`
			);
		}
		const sourceTotal = candidate.sourceTotal ?? set?.count ?? 0;
		assertHost(
			"fixture-spec",
			Number.isInteger(sourceTotal) && sourceTotal >= 0,
			`invalid sourceTotal for scenario ${candidate.id}`
		);
		if (set && candidate.sourceTotal !== undefined) {
			assertHost("fixture-spec", candidate.sourceTotal === set.count, `sourceTotal does not match set ${set.id}`);
		}
		if (candidate.limit !== undefined) {
			assertHost(
				"fixture-spec",
				Number.isInteger(candidate.limit) && candidate.limit >= 1,
				`invalid limit for scenario ${candidate.id}`
			);
		}
		if (candidate.rawPageSize !== undefined) {
			assertHost(
				"fixture-spec",
				typeof candidate.rawPageSize === "string",
				`rawPageSize must be a string for scenario ${candidate.id}`
			);
		}
		if (candidate.primary) primaryCount += 1;
		if (candidate.performance) performanceCount += 1;
		const expectedTotal = Math.min(sourceTotal, candidate.limit ?? sourceTotal);
		return {
			...candidate,
			base,
			embed,
			expectedPages: Math.max(1, Math.ceil(expectedTotal / candidate.pageSize)),
			expectedTotal,
			set: set?.id,
			tag,
		};
	});
	assertHost("fixture-spec", primaryCount === 1, `expected one primary scenario, found ${primaryCount}`);
	assertHost("fixture-spec", performanceCount === 1, `expected one performance scenario, found ${performanceCount}`);
	return { fixtureId: value.fixtureId, scenarios, sets, version: value.version };
}

function yamlString(value) {
	return JSON.stringify(String(value));
}

function entryName(set, index) {
	const label = set.kind === "values" ? "Values" : set.kind === "compact" ? "Large" : titleCase(set.id);
	return `${label} ${String(index).padStart(4, "0")}`;
}

function titleCase(value) {
	return value
		.split(/[-_]/u)
		.map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
		.join(" ");
}

function buildEntry(set, index) {
	const name = entryName(set, index);
	const lines = [
		"---",
		`scenario: ${set.id}`,
		`score: ${index}`,
		"tags:",
		"  - bases-paginator-host",
		`  - ${set.tag}`,
	];
	if (set.kind !== "compact") {
		const status = ["Doing", "Done", "Todo"][(index - 1) % 3];
		lines.push(
			`status: ${status}`,
			`due: 2026-08-${String(((index - 1) % 28) + 1).padStart(2, "0")}`,
			`flag: ${index % 2 === 0 ? "true" : "false"}`,
			`zero: ${index === 1 ? 0 : index}`,
			`related: ${index % 4 === 0 ? '""' : '"[[Reference]]"'}`,
			"listValue:",
			`  - ${yamlString(index === 1 ? "alpha,beta" : `item-${index}`)}`,
			"  - gamma"
		);
	}
	if (set.kind === "values") {
		lines.push(
			`aliases: [${yamlString(`Alias ${index}`)}]`,
			`cover: ${yamlString("[[Assets/sample.svg]]")}`,
			`emptyText: ${index === 1 ? '""' : yamlString(`text-${index}`)}`
		);
	}
	lines.push("---", `# ${name}`, "", `Generated host fixture row ${index}.`, "");
	return lines.join("\n");
}

function baseOrder(scenario) {
	if (scenario.valueAssertions) {
		return [
			"file.name",
			"status",
			"score",
			"due",
			"flag",
			"zero",
			"tags",
			"related",
			"listValue",
			"cover",
			"formula.doubled",
			"formula.broken",
		];
	}
	if (scenario.performance) return ["file.name", "score"];
	return ["file.name", "status", "score", "due", "tags", "related", "formula.doubled"];
}

function buildBase(scenario) {
	const lines = [
		"filters:",
		"  and:",
		`    - file.hasTag(${yamlString(scenario.tag)})`,
		"formulas:",
		"  doubled: note.score * 2",
		"  broken: note.missing.asList()",
		"properties:",
		"  formula.doubled:",
		"    displayName: Doubled",
		"  formula.broken:",
		"    displayName: Formula fallback",
		"views:",
		"  - type: paginated-table",
		`    name: ${scenario.view}`,
	];
	if (scenario.groupBy) {
		lines.push("    groupBy:", `      property: ${scenario.groupBy}`, "      direction: ASC");
	}
	lines.push("    order:");
	for (const property of baseOrder(scenario)) lines.push(`      - ${property}`);
	const sort = Array.isArray(scenario.sort) ? scenario.sort : ["score"];
	lines.push("    sort:");
	for (const property of sort) lines.push(`      - property: ${property}`, "        direction: ASC");
	if (scenario.limit !== undefined) lines.push(`    limit: ${scenario.limit}`);
	lines.push(
		`    pageSize: ${yamlString(scenario.rawPageSize ?? scenario.pageSize)}`,
		"    stickyHeader: true",
		"    paginationPosition: top"
	);
	if (scenario.legacy) {
		lines.push(
			"    showSearchBox: false",
			"    showFilterBar: false",
			"    filterableColumns:",
			"      - status",
			"    filterPresets: malformed legacy data",
			"    listRenderMode: bullet"
		);
	}
	return `${lines.join("\n")}\n`;
}

export function buildFixtureFiles(spec) {
	const files = new Map();
	for (const set of spec.sets) {
		for (let index = 1; index <= set.count; index += 1) {
			const name = entryName(set, index);
			files.set(`Generated/${set.id}/${name}.md`, buildEntry(set, index));
		}
	}
	for (const scenario of spec.scenarios) {
		files.set(scenario.base, buildBase(scenario));
		files.set(scenario.embed, `# ${scenario.view}\n\n![[${scenario.base}#${scenario.view}]]\n`);
	}
	files.set("Reference.md", "# Reference\n\nHost fixture link target.\n");
	files.set(
		"Assets/sample.svg",
		'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#7c3aed"/><circle cx="16" cy="16" r="7" fill="#fff"/></svg>\n'
	);
	return files;
}

export async function readFixtureSpec(path) {
	return parseFixtureSpec(parseJson("fixture-spec", await readFile(path, "utf8")));
}

export async function contentSnapshot(vaultPath, configPath) {
	const hashes = new Map();
	async function visit(directory) {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			if (entry.name === ".trash" || entry.name === ".git") continue;
			const entryPath = resolve(directory, entry.name);
			if (entry.isDirectory()) {
				if (resolve(entryPath) === resolve(configPath)) continue;
				await visit(entryPath);
			} else if (entry.isFile()) {
				const key = relative(vaultPath, entryPath).replaceAll("\\", "/");
				const hash = createHash("sha256")
					.update(await readFile(entryPath))
					.digest("hex");
				hashes.set(key, hash);
			}
		}
	}
	await visit(vaultPath);
	return hashes;
}

export function snapshotDiff(before, after) {
	const changed = [];
	for (const key of new Set([...before.keys(), ...after.keys()])) {
		if (before.get(key) !== after.get(key)) changed.push(key);
	}
	return changed.sort();
}

export function fileExists(path) {
	return existsSync(path);
}
