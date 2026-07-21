#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, realpath, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";

import {
	DISPOSABLE_VAULT_NAME,
	FIXTURE_MARKER,
	HostTestError,
	RetryableHostTestError,
	assertHost,
	contentSnapshot,
	isWithin,
	parseEvalJson,
	parseEvalString,
	parseJson,
	readFixtureSpec,
	resolveVaultPath,
	snapshotDiff,
} from "./host-test-lib.mjs";

const PLUGIN_FILES = ["main.js", "manifest.json", "styles.css"];
const REQUIRED_CLI_COMMANDS = [
	"base:query",
	"plugin:disable",
	"plugin:enable",
	"plugin:reload",
	"reload",
	"dev:errors",
	"dev:console",
	"dev:debug",
	"dev:dom",
	"dev:screenshot",
	"dev:mobile",
	"dev:cdp",
	"eval",
];
const STANDARD_PAGE_SIZES = new Set([10, 25, 50, 100]);
const EXPECTED_BUTTONS = ["First page", "Previous page", "Next page", "Last page"];
const USAGE = `Usage:
  npm run test:host -- --vault <disposable-vault> --scenarios <scenarios.json> [--cli <path>] [--artifacts <dir>]
  npm run test:host -- --vault <disposable-vault> --base <fixture.base> [--embed <fixture.md>] [--cli <path>] [--artifacts <dir>]

The scenario form is authoritative. The legacy --base/--embed form remains a
single-fixture smoke test. The runner deploys only this plugin below Obsidian's
resolved config directory and fails if any vault-content byte changes.`;

const DOM_SNAPSHOT = `JSON.stringify((()=>{const scope=document.querySelector(".workspace-leaf.mod-active")??document;const container=scope.querySelector(".bp-container");if(!container)return {ready:false,activePath:app.workspace.getActiveFile()?.path??null,containers:scope.querySelectorAll(".bp-container").length};const visible=(element)=>Boolean(element&&!element.hidden&&getComputedStyle(element).display!=="none"&&getComputedStyle(element).visibility!=="hidden");const buttons=[...container.querySelectorAll(".bp-pagination-btn")].map(button=>{const bounds=button.getBoundingClientRect();return {label:button.getAttribute("aria-label"),disabled:button.disabled,width:bounds.width,height:bounds.height,focused:document.activeElement===button,focusVisible:button.matches(":focus-visible"),outlineStyle:getComputedStyle(button).outlineStyle,outlineWidth:getComputedStyle(button).outlineWidth};});const select=container.querySelector(".bp-page-size-selector select");const input=container.querySelector(".bp-custom-page-size-input");const error=container.querySelector(".bp-custom-page-size-error");const rows=[...container.querySelectorAll("tbody .bp-table-row")];const rowCells=rows.slice(0,10).map(row=>[...row.querySelectorAll(".bp-table-cell")].map(cell=>({text:cell.textContent?.trim()??"",empty:cell.classList.contains("bp-table-cell-empty"),html:cell.innerHTML.slice(0,500)})));return {ready:true,activePath:app.workspace.getActiveFile()?.path??null,containers:scope.querySelectorAll(".bp-container").length,rows:rows.length,groups:container.querySelectorAll("tbody .bp-group-row").length,fileLinks:container.querySelectorAll("tbody .bp-table-row > .bp-table-cell:first-child a").length,filePaths:rows.map(row=>row.querySelector(".bp-table-cell:first-child a")?.getAttribute("data-href")??null).filter(Boolean),links:container.querySelectorAll("tbody a").length,images:container.querySelectorAll("tbody img").length,assetLinks:container.querySelectorAll('tbody [data-href="Assets/sample.svg"]').length,checkboxes:[...container.querySelectorAll('tbody input[type="checkbox"]')].map(item=>({checked:item.checked,ariaChecked:item.getAttribute("aria-checked")})),headerTexts:[...container.querySelectorAll("thead th")].map(cell=>cell.textContent?.trim()??""),cellText:rows.map(row=>row.textContent?.trim()??"").join("\\n"),rowCells,status:container.querySelector("[role=status]")?.textContent?.trim()??"",item:container.querySelector(".bp-item-info")?.textContent?.trim()??"",pageSize:select?.value??"",options:select?[...select.options].map(option=>option.value):[],customValue:input?.value??"",customInputHidden:input?.hidden??true,inputMin:input?.getAttribute("min")??null,inputMax:input?.getAttribute("max")??null,ariaInvalid:input?.getAttribute("aria-invalid")??null,errorVisible:visible(error),emptyVisible:visible(container.querySelector(".bp-empty-state")),emptyText:container.querySelector(".bp-empty-state")?.textContent?.trim()??"",landmarks:{pagination:container.querySelectorAll('nav[aria-label="Pagination"]').length,tables:container.querySelectorAll('table[aria-label="Paginated results"]').length},buttons};})())`;

function fail(stage, message, options) {
	throw new HostTestError(stage, message, options);
}

function parseArguments(argv) {
	const values = new Map();
	const known = new Set(["--artifacts", "--base", "--cli", "--embed", "--scenarios", "--vault"]);
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (token === "--help" || token === "-h") return { help: true, values };
		if (!known.has(token)) fail("arguments", `unknown option: ${token ?? "<missing>"}`);
		const value = argv[index + 1];
		if (!value || value.startsWith("--")) fail("arguments", `${token} requires a value`);
		values.set(token.slice(2), normalizeArgumentValue(value));
		index += 1;
	}
	return { help: false, values };
}

function normalizeArgumentValue(value) {
	if (process.platform !== "win32") return value;
	const unwrapped = value.startsWith("^") && value.endsWith("^") ? value.slice(1, -1) : value;
	return unwrapped.replaceAll("^ ", " ");
}

function requiredOption(values, name) {
	const value = values.get(name)?.trim();
	if (!value) fail("arguments", `--${name} is required\n${USAGE}`);
	return value;
}

function resolveCli(explicit) {
	if (explicit) return explicit;
	if (process.env.OBSIDIAN_CLI) return process.env.OBSIDIAN_CLI;
	const windowsCli = "C:\\Program Files\\Obsidian\\Obsidian.com";
	if (process.platform === "win32" && existsSync(windowsCli)) return windowsCli;
	return "obsidian";
}

function runProcess(command, args, stage) {
	const result = spawnSync(command, args, {
		cwd: process.cwd(),
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
		timeout: 30_000,
		windowsHide: true,
	});
	if (result.error) fail(stage, `${command} could not start: ${result.error.message}`);
	const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
	if (result.status !== 0) {
		fail(stage, `${command} exited ${result.status ?? "without a status"}${output ? `:\n${output}` : ""}`);
	}
	return output;
}

function log(stage) {
	console.error(`[host-test] ${stage}`);
}

function sleep(milliseconds) {
	return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function parsePageStatus(value) {
	const match = /^Page (\d+) of (\d+)$/u.exec(value);
	return match ? { current: Number(match[1]), total: Number(match[2]) } : null;
}

function parseItemStatus(value) {
	const match = /^Showing (\d+)[–-](\d+) of (\d+)$/u.exec(value);
	return match ? { start: Number(match[1]), end: Number(match[2]), total: Number(match[3]) } : null;
}

function compactSnapshot(snapshot) {
	return {
		buttons: snapshot.buttons.map(({ disabled, label }) => ({ disabled, label })),
		emptyVisible: snapshot.emptyVisible,
		groups: snapshot.groups,
		item: snapshot.item,
		pageSize: snapshot.pageSize,
		rows: snapshot.rows,
		status: snapshot.status,
	};
}

function collectAxFacts(tree) {
	const nodes = Array.isArray(tree?.nodes) ? tree.nodes : Array.isArray(tree?.result?.nodes) ? tree.result.nodes : [];
	return nodes.map((node) => ({
		name: typeof node?.name?.value === "string" ? node.name.value : "",
		role: typeof node?.role?.value === "string" ? node.role.value : "",
	}));
}

function cdpResult(output, stage) {
	const parsed = parseJson(stage, output);
	return parsed?.result ?? parsed;
}

function metricValue(result, name) {
	const metrics = Array.isArray(result?.metrics) ? result.metrics : [];
	return metrics.find((metric) => metric.name === name)?.value ?? null;
}

function queryPaths(rows, stage) {
	const paths = rows.map((row) => row?.path).filter((path) => typeof path === "string");
	assertHost(stage, paths.length === rows.length, "base:query returned a row without a path");
	return paths;
}

async function main() {
	const parsedArguments = parseArguments(process.argv.slice(2));
	if (parsedArguments.help) {
		console.log(USAGE);
		return;
	}

	const vault = requiredOption(parsedArguments.values, "vault");
	const scenariosArgument = parsedArguments.values.get("scenarios")?.trim();
	const baseArgument = parsedArguments.values.get("base")?.trim();
	const embedArgument = parsedArguments.values.get("embed")?.trim();
	assertHost(
		"safety",
		DISPOSABLE_VAULT_NAME.test(vault),
		`refusing vault '${vault}': its name must mark it as test, qa, sandbox, or disposable`
	);
	assertHost(
		"arguments",
		Boolean(scenariosArgument) !== Boolean(baseArgument),
		"provide exactly one of --scenarios or --base"
	);
	if (baseArgument) {
		assertHost("fixture", extname(baseArgument).toLowerCase() === ".base", `--base must target .base`);
	}
	if (embedArgument) {
		assertHost("fixture", extname(embedArgument).toLowerCase() === ".md", `--embed must target Markdown`);
	}
	if (scenariosArgument) {
		assertHost("arguments", !embedArgument, "--embed is only valid with legacy --base mode");
	}

	const cli = resolveCli(parsedArguments.values.get("cli"));
	const cliRun = (args, stage = args[0] ?? "cli") => runProcess(cli, [`vault=${vault}`, ...args], stage);
	const cliRunGlobal = (args, stage = args[0] ?? "cli") => runProcess(cli, args, stage);
	const cliEventually = async (args, stage) => {
		let output = "";
		for (let attempt = 0; attempt < 40; attempt += 1) {
			output = cliRun(args, stage);
			if (!/Command ".+" not found\.?/u.test(output)) return output;
			await sleep(250);
		}
		fail(stage, `Obsidian command registration did not recover:\n${output}`);
	};
	const ensureDebugCapture = async () => {
		let lastFailure = "debugger did not attach";
		for (let attempt = 0; attempt < 3; attempt += 1) {
			try {
				await cliEventually(["dev:debug", "off"], `debug-reset-${attempt + 1}`);
			} catch (error) {
				lastFailure = error instanceof Error ? error.message : String(error);
				if (!lastFailure.includes("ETIMEDOUT")) throw error;
			}
			try {
				await cliEventually(["dev:debug", "on"], `debug-on-${attempt + 1}`);
			} catch (error) {
				lastFailure = error instanceof Error ? error.message : String(error);
				if (!lastFailure.includes("ETIMEDOUT")) throw error;
			}
			const capture = await cliEventually(["dev:console", "clear"], `console-clear-${attempt + 1}`);
			if (!/Debugger not attached/iu.test(capture)) return;
			lastFailure = capture;
			await sleep(250);
		}
		fail("debug-on", `could not start console capture: ${lastFailure}`);
	};
	const evalJson = async (code, stage = "eval") =>
		parseEvalJson(await cliEventually(["eval", `code=${code}`], stage), stage);

	const help = cliRunGlobal(["help"], "cli-help");
	for (const command of REQUIRED_CLI_COMMANDS) {
		assertHost("cli-help", help.includes(command), `installed CLI does not expose ${command}`);
	}
	const obsidianVersion = cliRunGlobal(["version"], "cli-version");

	const root = process.cwd();
	const manifest = parseJson("package", await readFile(join(root, "manifest.json"), "utf8"));
	assertHost("package", typeof manifest.id === "string" && manifest.id.length > 0, "manifest.json:id is missing");
	if (process.env.npm_execpath) {
		runProcess(process.execPath, [process.env.npm_execpath, "run", "build"], "build");
	} else {
		runProcess(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], "build");
	}
	for (const file of PLUGIN_FILES) {
		assertHost("package", existsSync(join(root, file)), `${file} is missing; run npm run build first`);
	}

	const vaultPath = await realpath(await resolveVaultPath(vault, cliRun, cliRunGlobal));
	const configDir = parseEvalString(
		await cliEventually(["eval", "code=JSON.stringify(app.vault.configDir)"], "config-dir"),
		"config-dir"
	);
	assertHost(
		"config-dir",
		typeof configDir === "string" && configDir.length > 0,
		"Obsidian returned no config directory"
	);
	const configPath = resolve(vaultPath, configDir);
	assertHost(
		"vault-resolve",
		isWithin(vaultPath, configPath) && (await stat(configPath)).isDirectory(),
		`${vaultPath} is not an Obsidian vault`
	);

	let fixtureSpec;
	let scenarios;
	if (scenariosArgument) {
		const scenariosPath = resolve(root, scenariosArgument);
		assertHost(
			"fixture",
			isWithin(root, scenariosPath) && existsSync(scenariosPath),
			"scenario file is missing or escapes the repository"
		);
		fixtureSpec = await readFixtureSpec(scenariosPath);
		const markerPath = resolve(vaultPath, FIXTURE_MARKER);
		assertHost("fixture", existsSync(markerPath), `fixture marker is missing; run npm run test:host:setup first`);
		const marker = parseJson("fixture", await readFile(markerPath, "utf8"));
		assertHost(
			"fixture",
			marker.fixtureId === fixtureSpec.fixtureId,
			`fixture marker '${String(marker.fixtureId)}' does not match '${fixtureSpec.fixtureId}'`
		);
		scenarios = fixtureSpec.scenarios;
	} else {
		scenarios = [
			{
				base: baseArgument,
				embed: embedArgument,
				id: "legacy-smoke",
				primary: true,
				view: undefined,
			},
		];
	}
	for (const scenario of scenarios) {
		for (const fixturePath of [scenario.base, scenario.embed].filter(Boolean)) {
			const absolutePath = resolve(vaultPath, fixturePath);
			assertHost(
				"fixture",
				isWithin(vaultPath, absolutePath) && existsSync(absolutePath),
				`fixture is missing or escapes the vault: ${fixturePath}`
			);
		}
	}

	const contentBefore = await contentSnapshot(vaultPath, configPath);
	const pluginDirectory = resolve(configPath, "plugins", manifest.id);
	assertHost("deploy", isWithin(configPath, pluginDirectory), "resolved plugin directory escapes config");
	await mkdir(pluginDirectory, { recursive: true });
	for (const file of PLUGIN_FILES) await copyFile(join(root, file), join(pluginDirectory, file));
	log(`deployed ${manifest.id} to ${vault}`);

	const artifacts = resolve(root, parsedArguments.values.get("artifacts") ?? ".oma/obsidian-host-test");
	await mkdir(artifacts, { recursive: true });
	let mobileEnabled = false;
	let deviceMetricsEnabled = false;
	let debuggerEnabled = false;
	let runError;
	let summary;

	const domSnapshot = (stage) => evalJson(DOM_SNAPSHOT, stage);
	const waitFor = async (stage, predicate, read = domSnapshot) => {
		let last;
		for (let attempt = 0; attempt < 100; attempt += 1) {
			try {
				last = await read(stage);
			} catch (error) {
				if (!(error instanceof RetryableHostTestError)) throw error;
				last = { ready: false, retry: error.message };
			}
			if (predicate(last)) return last;
			await sleep(250);
		}
		fail(stage, `timed out; last state: ${JSON.stringify(last).slice(0, 4000)}`);
	};
	const openFixture = async (path, stage, expectedTotal) => {
		const expectedPath = path.replaceAll("\\", "/");
		const resetCandidates = fixtureSpec ? ["Reference.md"] : [baseArgument, embedArgument].filter(Boolean);
		const resetPath = resetCandidates.find((candidate) => candidate !== path);
		if (resetPath) {
			await cliEventually(["open", `path=${resetPath}`], `${stage}-reset`);
			await waitFor(
				`${stage}-reset`,
				(state) => state.activePath === resetPath.replaceAll("\\", "/"),
				(resetStage) =>
					evalJson("JSON.stringify({activePath:app.workspace.getActiveFile()?.path??null})", resetStage)
			);
		}
		await cliEventually(["open", `path=${path}`], stage);
		return waitFor(stage, (snapshot) => {
			if (!snapshot.ready || snapshot.activePath !== expectedPath || snapshot.containers !== 1) return false;
			if (expectedTotal === 0) {
				return snapshot.rows === 0 && snapshot.emptyVisible && snapshot.item === "No items";
			}
			return snapshot.rows > 0 && parseItemStatus(snapshot.item)?.total === expectedTotal;
		});
	};
	const clickButton = async (label, stage = "cdp-mouse") => {
		const labelLiteral = JSON.stringify(label);
		const rect = await evalJson(
			`JSON.stringify((()=>{const scope=document.querySelector(".workspace-leaf.mod-active")??document;const button=[...scope.querySelectorAll(".bp-pagination-btn")].find(item=>item.getAttribute("aria-label")===${labelLiteral});if(!button)return null;const bounds=button.getBoundingClientRect();return {x:bounds.left+bounds.width/2,y:bounds.top+bounds.height/2,disabled:button.disabled};})())`,
			`${stage}-locate`
		);
		assertHost(stage, rect && !rect.disabled, `${label} is missing or disabled`);
		for (const type of ["mousePressed", "mouseReleased"]) {
			const params = { button: "left", clickCount: 1, type, x: rect.x, y: rect.y };
			await cliEventually(
				["dev:cdp", "method=Input.dispatchMouseEvent", `params=${JSON.stringify(params)}`],
				stage
			);
		}
	};
	const keyboardActivate = async (label, targetPage, stage) => {
		const labelLiteral = JSON.stringify(label);
		const focused = await evalJson(
			`JSON.stringify((()=>{const scope=document.querySelector(".workspace-leaf.mod-active")??document;const button=[...scope.querySelectorAll(".bp-pagination-btn")].find(item=>item.getAttribute("aria-label")===${labelLiteral});button?.focus();return {found:Boolean(button),focused:document.activeElement===button};})())`,
			`${stage}-focus`
		);
		assertHost(stage, focused.found && focused.focused, `could not focus ${label}`);
		for (const type of ["rawKeyDown", "keyUp"]) {
			const params = {
				code: "Space",
				key: " ",
				nativeVirtualKeyCode: 32,
				text: type === "rawKeyDown" ? " " : undefined,
				type,
				windowsVirtualKeyCode: 32,
			};
			await cliEventually(
				["dev:cdp", "method=Input.dispatchKeyEvent", `params=${JSON.stringify(params)}`],
				stage
			);
		}
		return waitFor(stage, (snapshot) => parsePageStatus(snapshot.status)?.current === targetPage);
	};
	const baseQuery = async (scenario) => {
		const args = ["base:query", `path=${scenario.base}`];
		if (scenario.view) args.push(`view=${scenario.view}`);
		args.push("format=json");
		const rows = parseJson(`base-query:${scenario.id}`, await cliEventually(args, `base-query:${scenario.id}`));
		assertHost(`base-query:${scenario.id}`, Array.isArray(rows), "base:query did not return an array");
		return rows;
	};
	const assertScenario = (scenario, snapshot) => {
		const stage = `scenario:${scenario.id}`;
		const page = parsePageStatus(snapshot.status);
		const expectedTotal = scenario.expectedTotal;
		const pageSize = scenario.pageSize;
		const expectedPages = scenario.expectedPages;
		assertHost(stage, snapshot.containers === 1, `expected one paginator, found ${snapshot.containers}`);
		assertHost(
			stage,
			page?.current === 1 && page.total === expectedPages,
			`unexpected page status '${snapshot.status}'`
		);
		assertHost(stage, snapshot.rows === Math.min(pageSize, expectedTotal), `unexpected row count ${snapshot.rows}`);
		assertHost(stage, snapshot.fileLinks === snapshot.rows, `expected one file link per row`);
		assertHost(stage, snapshot.landmarks.pagination === 1, "pagination landmark is missing or duplicated");
		assertHost(stage, snapshot.landmarks.tables === 1, "labelled results table is missing or duplicated");
		assertHost(
			stage,
			["10", "25", "50", "100", "custom"].every((value) => snapshot.options.includes(value)),
			`page-size options are incomplete: ${snapshot.options.join(", ")}`
		);
		assertHost(stage, snapshot.inputMin === "1" && snapshot.inputMax === "1000", "custom bounds drifted");
		if (expectedTotal === 0) {
			assertHost(stage, snapshot.item === "No items", `unexpected empty item status '${snapshot.item}'`);
			assertHost(
				stage,
				snapshot.emptyVisible && snapshot.emptyText === "No results",
				"empty state is not visible"
			);
		} else {
			const item = parseItemStatus(snapshot.item);
			assertHost(
				stage,
				item?.start === 1 && item.end === snapshot.rows && item.total === expectedTotal,
				`row/status mismatch: '${snapshot.item}'`
			);
			assertHost(stage, !snapshot.emptyVisible, "empty state is visible for non-empty results");
		}
		for (const label of EXPECTED_BUTTONS) {
			assertHost(
				stage,
				snapshot.buttons.some((button) => button.label === label),
				`missing '${label}'`
			);
		}
		const canAdvance = expectedPages > 1;
		assertHost(
			stage,
			snapshot.buttons.find((button) => button.label === "First page")?.disabled,
			"first page must be disabled"
		);
		assertHost(
			stage,
			snapshot.buttons.find((button) => button.label === "Next page")?.disabled === !canAdvance,
			"next-page boundary is incorrect"
		);
		if (STANDARD_PAGE_SIZES.has(pageSize)) {
			assertHost(
				stage,
				snapshot.pageSize === String(pageSize) && snapshot.customInputHidden,
				"standard page size did not synchronize"
			);
		} else {
			assertHost(
				stage,
				snapshot.pageSize === "custom" &&
					!snapshot.customInputHidden &&
					snapshot.customValue === String(pageSize),
				"custom page size did not synchronize"
			);
		}
		if (scenario.expectGroups && expectedTotal > 0) {
			assertHost(stage, snapshot.groups > 0, "group headers were not rendered");
		}
	};

	try {
		log("reload vault to ingest the externally prepared fixture");
		await cliEventually(["reload"], "vault-reload");
		await waitFor(
			"fixture-index",
			(state) => state.exists,
			(stage) => {
				const indexedFixture = scenarios.find((scenario) => scenario.primary)?.base ?? scenarios[0].base;
				return evalJson(
					`JSON.stringify({exists:Boolean(app.vault.getAbstractFileByPath(${JSON.stringify(indexedFixture)}))})`,
					stage
				);
			}
		);

		log("enable Bases and exercise plugin lifecycle");
		await ensureDebugCapture();
		debuggerEnabled = true;
		await cliEventually(["dev:errors", "clear"], "errors-clear");
		await cliEventually(["plugin:enable", "id=bases", "filter=core"], "bases-enable");
		await cliEventually(["plugin:enable", `id=${manifest.id}`, "filter=community"], "plugin-enable");
		await cliEventually(["plugin:reload", `id=${manifest.id}`], "plugin-reload-1");
		await cliEventually(["plugin:reload", `id=${manifest.id}`], "plugin-reload-2");
		await waitFor(
			"view-registration",
			(state) => state.registered,
			(stage) =>
				evalJson(
					"JSON.stringify({registered:Boolean(app.internalPlugins.getPluginById('bases')?.instance?.registrations?.['paginated-table'])})",
					stage
				)
		);

		const queryResults = new Map();
		for (const scenario of scenarios) {
			const rows = await baseQuery(scenario);
			if (fixtureSpec) {
				assertHost(
					`base-query:${scenario.id}`,
					rows.length === scenario.expectedTotal,
					`expected ${scenario.expectedTotal} rows, received ${rows.length}`
				);
			} else {
				scenario.expectedTotal = rows.length;
			}
			queryResults.set(scenario.id, rows);
		}

		const primary = scenarios.find((scenario) => scenario.primary);
		assertHost("fixture", primary, "primary scenario is missing");
		let lifecycle = await openFixture(primary.base, "lifecycle-open", primary.expectedTotal);
		if (!fixtureSpec) {
			const item = parseItemStatus(lifecycle.item);
			primary.pageSize = item?.end ?? Math.max(1, primary.expectedTotal);
			primary.expectedPages = parsePageStatus(lifecycle.status)?.total ?? 1;
		}
		assertScenario(primary, lifecycle);
		await cliEventually(["plugin:disable", `id=${manifest.id}`, "filter=community"], "plugin-disable");
		const disabledState = await waitFor(
			"plugin-disable",
			(state) => !state.enabled,
			(stage) =>
				evalJson(
					`JSON.stringify({enabled:app.plugins.enabledPlugins.has(${JSON.stringify(manifest.id)}),containers:document.querySelectorAll(".bp-container").length})`,
					stage
				)
		);
		let disabledAfterNavigation = disabledState;
		if (fixtureSpec) {
			await cliEventually(["open", "path=Reference.md"], "plugin-disable-navigate");
			disabledAfterNavigation = await waitFor(
				"plugin-disable-navigate",
				(state) => state.activePath === "Reference.md" && state.containers === 0,
				(stage) =>
					evalJson(
						`JSON.stringify({activePath:app.workspace.getActiveFile()?.path??null,containers:document.querySelectorAll(".bp-container").length})`,
						stage
					)
			);
		}
		await cliEventually(["plugin:enable", `id=${manifest.id}`, "filter=community"], "plugin-reenable");
		await cliEventually(["plugin:reload", `id=${manifest.id}`], "plugin-rereload");
		lifecycle = await openFixture(primary.base, "lifecycle-reopen", primary.expectedTotal);
		assertScenario(primary, lifecycle);

		const scenarioResults = [];
		for (const scenario of scenarios) {
			log(`verify scenario ${scenario.id}`);
			const first = await openFixture(scenario.base, `scenario:${scenario.id}:open`, scenario.expectedTotal);
			if (!fixtureSpec && !scenario.pageSize) {
				const item = parseItemStatus(first.item);
				scenario.pageSize = item?.end ?? Math.max(1, scenario.expectedTotal);
				scenario.expectedPages = parsePageStatus(first.status)?.total ?? 1;
			}
			assertScenario(scenario, first);
			const result = {
				id: scenario.id,
				queryRows: queryResults.get(scenario.id).length,
				first: compactSnapshot(first),
			};

			if (scenario.walkAllPages && scenario.expectedPages > 1) {
				const seenPaths = new Set(first.filePaths);
				let current = first;
				for (let page = 2; page <= scenario.expectedPages; page += 1) {
					await clickButton("Next page", `scenario:${scenario.id}:walk`);
					current = await waitFor(
						`scenario:${scenario.id}:page-${page}`,
						(snapshot) => parsePageStatus(snapshot.status)?.current === page
					);
					for (const path of current.filePaths) seenPaths.add(path);
				}
				const expectedPaths = new Set(
					queryPaths(queryResults.get(scenario.id), `scenario:${scenario.id}:paths`)
				);
				assertHost(
					`scenario:${scenario.id}:walk`,
					seenPaths.size === expectedPaths.size && [...expectedPaths].every((path) => seenPaths.has(path)),
					`page walk covered ${seenPaths.size}/${expectedPaths.size} query paths`
				);
				assertHost(
					`scenario:${scenario.id}:walk`,
					current.buttons.find((button) => button.label === "Next page")?.disabled,
					"last-page boundary is not disabled"
				);
				result.walkedPages = scenario.expectedPages;
			}
			if (scenario.valueAssertions) {
				const rendered = first.cellText;
				assertHost(`scenario:${scenario.id}:values`, rendered.includes("0"), "numeric zero was not rendered");
				assertHost(
					`scenario:${scenario.id}:values`,
					rendered.includes("alpha,beta"),
					"comma-bearing list value was not rendered"
				);
				const flagIndex = first.headerTexts.findIndex((text) => text.toLowerCase() === "flag");
				assertHost(`scenario:${scenario.id}:values`, flagIndex >= 0, "flag column is missing");
				assertHost(
					`scenario:${scenario.id}:values`,
					first.rowCells[0]?.[flagIndex]?.empty === false,
					"boolean false was mistaken for an empty value"
				);
				assertHost(
					`scenario:${scenario.id}:values`,
					first.assetLinks > 0,
					"native attachment link value did not render"
				);
				result.nativeValues = {
					assetLinks: first.assetLinks,
					checkboxes: first.checkboxes.length,
					images: first.images,
				};
			}
			scenarioResults.push(result);
		}

		log("verify primary mouse, keyboard, embedded, validation, and accessibility flows");
		const primaryFirst = await openFixture(primary.base, "primary-mouse-open", primary.expectedTotal);
		let mousePage = null;
		let keyboardPage = null;
		if (primary.expectedPages > 1) {
			await clickButton("Next page", "primary-mouse");
			mousePage = await waitFor("primary-mouse", (snapshot) => parsePageStatus(snapshot.status)?.current === 2);
			await openFixture(primary.base, "primary-keyboard-open", primary.expectedTotal);
			keyboardPage = await keyboardActivate("Next page", 2, "primary-keyboard");
			const focusedNext = keyboardPage.buttons.find((button) => button.label === "Next page");
			assertHost("primary-keyboard", focusedNext?.focused, "keyboard activation lost focus");
			assertHost(
				"primary-keyboard",
				focusedNext.focusVisible && focusedNext.outlineStyle !== "none" && focusedNext.outlineWidth !== "0px",
				"keyboard focus ring is not visible"
			);
		}

		let embedded = null;
		if (primary.embed) {
			embedded = await openFixture(primary.embed, "primary-embedded", primary.expectedTotal);
			assertHost(
				"primary-embedded",
				parseItemStatus(embedded.item)?.total === primary.expectedTotal,
				`embedded total differs: '${embedded.item}'`
			);
		}

		await openFixture(primary.base, "primary-invalid-open", primary.expectedTotal);
		const invalid = await evalJson(
			`JSON.stringify((()=>{const container=document.querySelector(".workspace-leaf.mod-active .bp-container");const select=container?.querySelector(".bp-page-size-selector select");const input=container?.querySelector(".bp-custom-page-size-input");if(!select||!input)return {applied:false};select.value="custom";select.dispatchEvent(new Event("change",{bubbles:true}));input.value="1001";input.dispatchEvent(new Event("change",{bubbles:true}));return {applied:true};})())`,
			"custom-invalid-apply"
		);
		assertHost("custom-invalid", invalid.applied, "custom page-size controls are missing");
		const invalidSnapshot = await waitFor(
			"custom-invalid",
			(snapshot) => snapshot.ariaInvalid === "true" && snapshot.errorVisible
		);

		await openFixture(primary.base, "accessibility-open", primary.expectedTotal);
		const axTree = cdpResult(
			await cliEventually(["dev:cdp", "method=Accessibility.getFullAXTree", "params={}"], "accessibility"),
			"accessibility"
		);
		const axFacts = collectAxFacts(axTree);
		const axRoles = new Set(axFacts.map((fact) => fact.role));
		const axNames = new Set(axFacts.map((fact) => fact.name));
		for (const role of ["navigation", "table", "status", "combobox", "button"]) {
			assertHost("accessibility", axRoles.has(role), `accessibility tree is missing role '${role}'`);
		}
		for (const name of [
			"Pagination",
			"Paginated results",
			"Items per page",
			primaryFirst.status,
			...EXPECTED_BUTTONS,
		]) {
			assertHost("accessibility", axNames.has(name), `accessibility tree is missing '${name}'`);
		}

		log("capture desktop and 390 px mobile evidence");
		await openFixture(primary.base, "desktop-open", primary.expectedTotal);
		const desktopScreenshot = join(artifacts, "desktop.png");
		await cliEventually(["dev:screenshot", `path=${desktopScreenshot}`], "desktop-screenshot");
		await cliEventually(["dev:mobile", "on"], "mobile-on");
		mobileEnabled = true;
		await cliEventually(
			[
				"dev:cdp",
				"method=Emulation.setDeviceMetricsOverride",
				`params=${JSON.stringify({ deviceScaleFactor: 1, height: 844, mobile: true, width: 390 })}`,
			],
			"mobile-metrics-on"
		);
		deviceMetricsEnabled = true;
		const mobile = await openFixture(primary.base, "mobile-open", primary.expectedTotal);
		const mobileMetrics = await evalJson(
			`JSON.stringify({width:window.innerWidth,height:window.innerHeight,itemInfoFlexBasis:getComputedStyle(document.querySelector(".bp-item-info")).flexBasis,buttons:[...document.querySelectorAll(".workspace-leaf.mod-active .bp-pagination-btn")].map(button=>{const bounds=button.getBoundingClientRect();return {width:bounds.width,height:bounds.height};})})`,
			"mobile-metrics"
		);
		assertHost(
			"mobile",
			mobileMetrics.width === 390 && mobileMetrics.height === 844,
			`viewport override failed: ${JSON.stringify(mobileMetrics)}`
		);
		assertHost("mobile", mobileMetrics.itemInfoFlexBasis === "100%", "narrow media query did not apply");
		assertHost(
			"mobile",
			mobileMetrics.buttons.every((button) => button.width >= 40 && button.height >= 40),
			"mobile pagination targets are smaller than 40 px"
		);
		const mobileScreenshot = join(artifacts, "mobile.png");
		await cliEventually(["dev:screenshot", `path=${mobileScreenshot}`], "mobile-screenshot");
		await cliEventually(
			["dev:cdp", "method=Emulation.clearDeviceMetricsOverride", "params={}"],
			"mobile-metrics-off"
		);
		deviceMetricsEnabled = false;
		await cliEventually(["dev:mobile", "off"], "mobile-off");
		mobileEnabled = false;

		let performanceEvidence = null;
		const performanceScenario = scenarios.find((scenario) => scenario.performance);
		if (performanceScenario) {
			log(`measure advisory performance for ${performanceScenario.id}`);
			await cliEventually(["dev:cdp", "method=Performance.enable", "params={}"], "performance-enable");
			const beforeMetrics = cdpResult(
				await cliEventually(["dev:cdp", "method=Performance.getMetrics", "params={}"], "performance-before"),
				"performance-before"
			);
			const openedAt = performance.now();
			const largeFirst = await openFixture(
				performanceScenario.base,
				"performance-open",
				performanceScenario.expectedTotal
			);
			const openMilliseconds = performance.now() - openedAt;
			assertHost(
				"performance",
				largeFirst.rows === performanceScenario.pageSize,
				"large first page is not bounded"
			);
			const transitions = [];
			for (let iteration = 0; iteration < 3; iteration += 1) {
				let startedAt = performance.now();
				await clickButton("Last page", "performance-last");
				await waitFor(
					"performance-last",
					(snapshot) => parsePageStatus(snapshot.status)?.current === performanceScenario.expectedPages
				);
				transitions.push({ direction: "last", milliseconds: performance.now() - startedAt });
				startedAt = performance.now();
				await clickButton("First page", "performance-first");
				const restored = await waitFor(
					"performance-first",
					(snapshot) => parsePageStatus(snapshot.status)?.current === 1
				);
				assertHost(
					"performance",
					restored.rows === performanceScenario.pageSize,
					"large DOM row count grew or shrank"
				);
				transitions.push({ direction: "first", milliseconds: performance.now() - startedAt });
			}
			const afterMetrics = cdpResult(
				await cliEventually(["dev:cdp", "method=Performance.getMetrics", "params={}"], "performance-after"),
				"performance-after"
			);
			const heapBefore = metricValue(beforeMetrics, "JSHeapUsedSize");
			const heapAfter = metricValue(afterMetrics, "JSHeapUsedSize");
			performanceEvidence = {
				heapBytesAfter: heapAfter,
				heapBytesBefore: heapBefore,
				heapDeltaBytes: heapBefore === null || heapAfter === null ? null : heapAfter - heapBefore,
				openMilliseconds,
				transitions,
			};
		}

		log("check host error buffers and read-only integrity");
		const errors = await cliEventually(["dev:errors"], "errors");
		const consoleErrors = await cliEventually(["dev:console", "level=error"], "console-errors");
		assertHost("errors", /No errors captured\./iu.test(errors), `Obsidian captured errors:\n${errors}`);
		assertHost(
			"console-errors",
			/No console messages captured\./iu.test(consoleErrors),
			`Obsidian captured error-level console output:\n${consoleErrors}`
		);
		await cliEventually(["dev:debug", "off"], "debug-off");
		debuggerEnabled = false;

		summary = {
			accessibility: {
				names: ["Pagination", "Paginated results", "Items per page", ...EXPECTED_BUTTONS],
				roles: ["navigation", "table", "status", "combobox", "button"],
			},
			artifacts: [desktopScreenshot, mobileScreenshot],
			embedded: embedded ? compactSnapshot(embedded) : null,
			fixtureId: fixtureSpec?.fixtureId ?? null,
			invalidPageSize: { ariaInvalid: invalidSnapshot.ariaInvalid, errorVisible: invalidSnapshot.errorVisible },
			lifecycle: {
				disabledAfterNavigation,
				disabledState,
				reenabled: compactSnapshot(lifecycle),
				reloads: 3,
			},
			mobile: { rows: mobile.rows, ...mobileMetrics },
			mousePage: mousePage ? compactSnapshot(mousePage) : null,
			keyboardPage: keyboardPage ? compactSnapshot(keyboardPage) : null,
			obsidianVersion,
			performance: performanceEvidence,
			platform: `${process.platform}-${process.arch}`,
			pluginId: manifest.id,
			residualManualChecks: [
				"real screen-reader speech",
				"physical iOS/Android behavior",
				"OS-level window focus",
			],
			scenarios: scenarioResults,
			vault,
			vaultPath,
		};
	} catch (error) {
		runError = error;
	} finally {
		if (deviceMetricsEnabled) {
			try {
				await cliEventually(
					["dev:cdp", "method=Emulation.clearDeviceMetricsOverride", "params={}"],
					"mobile-metrics-cleanup"
				);
			} catch (cleanupError) {
				runError ??= cleanupError;
			}
		}
		if (mobileEnabled) {
			try {
				await cliEventually(["dev:mobile", "off"], "mobile-cleanup");
			} catch (cleanupError) {
				runError ??= cleanupError;
			}
		}
		if (debuggerEnabled) {
			try {
				await cliEventually(["dev:debug", "off"], "debug-cleanup");
			} catch (cleanupError) {
				runError ??= cleanupError;
			}
		}
	}

	const contentAfter = await contentSnapshot(vaultPath, configPath);
	const changedContent = snapshotDiff(contentBefore, contentAfter);
	if (changedContent.length > 0) {
		const driftError = new HostTestError(
			"content-integrity",
			`vault content changed: ${changedContent.join(", ")}`
		);
		if (runError instanceof Error) driftError.cause = runError;
		throw driftError;
	}
	if (runError) throw runError;

	console.log(JSON.stringify({ contentFilesChecked: contentAfter.size, status: "passed", ...summary }, null, 2));
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
