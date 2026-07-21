#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import process from "node:process";

const PLUGIN_FILES = ["main.js", "manifest.json", "styles.css"];
const VAULT_CONTENT_EXTENSIONS = new Set([".base", ".canvas", ".md"]);
const DISPOSABLE_VAULT_NAME = /(?:^|[-_. ])(?:test|qa|sandbox|disposable)(?:$|[-_. ])/i;
const REQUIRED_CLI_COMMANDS = [
	"plugin:reload",
	"dev:errors",
	"dev:console",
	"dev:dom",
	"dev:screenshot",
	"dev:mobile",
	"dev:cdp",
	"eval",
];
const USAGE = `Usage:
  npm run test:host -- --vault <disposable-vault> --base <fixture.base> [--embed <fixture.md>] [--cli <path>] [--artifacts <dir>]

The vault name must contain test, qa, sandbox, or disposable. The runner deploys
the current package only under the resolved Obsidian config directory and rejects
any vault-content drift.`;

class HostTestError extends Error {
	constructor(stage, message) {
		super(`[${stage}] ${message}`);
		this.name = "HostTestError";
	}
}

class RetryableHostTestError extends HostTestError {}

function fail(stage, message) {
	throw new HostTestError(stage, message);
}

function assert(stage, condition, message) {
	if (!condition) fail(stage, message);
}

function parseArguments(argv) {
	const values = new Map();
	const known = new Set(["--artifacts", "--base", "--cli", "--embed", "--vault"]);
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
		maxBuffer: 32 * 1024 * 1024,
		windowsHide: true,
	});
	if (result.error) fail(stage, `${command} could not start: ${result.error.message}`);
	const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
	if (result.status !== 0)
		fail(stage, `${command} exited ${result.status ?? "without a status"}${output ? `:\n${output}` : ""}`);
	return output;
}

function parseJson(stage, output) {
	try {
		return JSON.parse(output);
	} catch (error) {
		fail(
			stage,
			`expected JSON output: ${error instanceof Error ? error.message : String(error)}\n${output.slice(0, 1000)}`
		);
	}
}

function parseEvalJson(output, stage) {
	if (output.includes('Command "eval" not found')) {
		throw new RetryableHostTestError(stage, "Obsidian eval command is temporarily unavailable");
	}
	const marker = output.lastIndexOf("=>");
	assert(stage, marker >= 0, `unexpected eval output:\n${output}`);
	let parsed = parseJson(stage, output.slice(marker + 2).trim());
	if (typeof parsed === "string") parsed = parseJson(stage, parsed);
	return parsed;
}

function parseEvalString(output, stage) {
	if (output.includes('Command "eval" not found')) {
		throw new RetryableHostTestError(stage, "Obsidian eval command is temporarily unavailable");
	}
	const marker = output.lastIndexOf("=>");
	assert(stage, marker >= 0, `unexpected eval output:\n${output}`);
	const value = output.slice(marker + 2).trim();
	return value.startsWith('"') ? parseJson(stage, value) : value;
}

function log(stage) {
	console.error(`[host-test] ${stage}`);
}

function isWithin(parent, child) {
	const pathFromParent = relative(resolve(parent), resolve(child));
	return pathFromParent === "" || (!pathFromParent.startsWith("..") && !isAbsolute(pathFromParent));
}

async function contentSnapshot(vaultPath, configPath) {
	const hashes = new Map();
	async function visit(directory) {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			if (entry.name === ".trash" || entry.name === ".git") continue;
			const entryPath = join(directory, entry.name);
			if (entry.isDirectory()) {
				if (resolve(entryPath) === configPath) continue;
				await visit(entryPath);
			} else if (entry.isFile() && VAULT_CONTENT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
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

function snapshotDiff(before, after) {
	const changed = [];
	for (const key of new Set([...before.keys(), ...after.keys()])) {
		if (before.get(key) !== after.get(key)) changed.push(key);
	}
	return changed.sort();
}

function sleep(milliseconds) {
	return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

const DOM_SNAPSHOT = `JSON.stringify((()=>{const scope=document.querySelector(".workspace-leaf.mod-active")??document;const container=scope.querySelector(".bp-container");if(!container)return {ready:false,activePath:app.workspace.getActiveFile()?.path??null};const buttons=[...container.querySelectorAll(".bp-pagination-btn")].map(button=>({label:button.getAttribute("aria-label"),disabled:button.disabled}));const select=container.querySelector(".bp-page-size-selector select");const input=container.querySelector(".bp-custom-page-size-input");return {ready:true,activePath:app.workspace.getActiveFile()?.path??null,containers:scope.querySelectorAll(".bp-container").length,rows:container.querySelectorAll("tbody .bp-table-row").length,groups:container.querySelectorAll("tbody .bp-group-row").length,fileLinks:container.querySelectorAll("tbody .bp-table-row > .bp-table-cell:first-child a").length,links:container.querySelectorAll("tbody a").length,status:container.querySelector("[role=status]")?.textContent?.trim()??"",item:container.querySelector(".bp-item-info")?.textContent?.trim()??"",pageSize:select?.value??"",options:select?[...select.options].map(option=>option.value):[],inputMin:input?.getAttribute("min")??null,inputMax:input?.getAttribute("max")??null,buttons};})())`;

function parsePageStatus(value) {
	const match = /^Page (\d+) of (\d+)$/.exec(value);
	return match ? { current: Number(match[1]), total: Number(match[2]) } : null;
}

function parseItemStatus(value) {
	const match = /^Showing (\d+)[–-](\d+) of (\d+)$/.exec(value);
	return match ? { start: Number(match[1]), end: Number(match[2]), total: Number(match[3]) } : null;
}

function collectAxValues(node, values = []) {
	if (Array.isArray(node)) {
		for (const item of node) collectAxValues(item, values);
	} else if (node && typeof node === "object") {
		if (typeof node.value === "string") values.push(node.value);
		for (const value of Object.values(node)) collectAxValues(value, values);
	}
	return values;
}

async function main() {
	const parsedArguments = parseArguments(process.argv.slice(2));
	if (parsedArguments.help) {
		console.log(USAGE);
		return;
	}

	const vault = requiredOption(parsedArguments.values, "vault");
	const base = requiredOption(parsedArguments.values, "base");
	const embed = parsedArguments.values.get("embed")?.trim();
	assert(
		"safety",
		DISPOSABLE_VAULT_NAME.test(vault),
		`refusing vault '${vault}': its name must mark it as test, qa, sandbox, or disposable`
	);
	assert("fixture", extname(base).toLowerCase() === ".base", `--base must target a .base file, got '${base}'`);
	if (embed)
		assert(
			"fixture",
			extname(embed).toLowerCase() === ".md",
			`--embed must target a Markdown file, got '${embed}'`
		);

	const cli = resolveCli(parsedArguments.values.get("cli"));
	const cliRun = (args, stage = args[0] ?? "cli") => runProcess(cli, [`vault=${vault}`, ...args], stage);
	const cliEventually = async (args, stage) => {
		let output = "";
		for (let attempt = 0; attempt < 40; attempt += 1) {
			output = cliRun(args, stage);
			if (!/Command ".+" not found\./.test(output)) return output;
			await sleep(250);
		}
		fail(stage, `Obsidian command registration did not recover:\n${output}`);
	};
	const help = cliRun(["help"], "cli-help");
	for (const command of REQUIRED_CLI_COMMANDS)
		assert("cli-help", help.includes(command), `installed CLI does not expose ${command}`);

	const root = process.cwd();
	const manifest = parseJson("package", await readFile(join(root, "manifest.json"), "utf8"));
	assert("package", typeof manifest.id === "string" && manifest.id.length > 0, "manifest.json:id is missing");
	if (process.env.npm_execpath) {
		runProcess(process.execPath, [process.env.npm_execpath, "run", "build"], "build");
	} else {
		runProcess(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], "build");
	}
	for (const file of PLUGIN_FILES)
		assert("package", existsSync(join(root, file)), `${file} is missing; run npm run build first`);

	const vaultPathText = cliRun(["vault", "info=path"], "vault-resolve").trim();
	const vaultPath = await realpath(vaultPathText);
	const configDir = parseEvalString(
		await cliEventually(["eval", "code=JSON.stringify(app.vault.configDir)"], "config-dir"),
		"config-dir"
	);
	assert(
		"config-dir",
		typeof configDir === "string" && configDir.length > 0,
		"Obsidian returned no config directory"
	);
	const configPath = resolve(vaultPath, configDir);
	assert(
		"vault-resolve",
		isWithin(vaultPath, configPath) && (await stat(configPath)).isDirectory(),
		`${vaultPath} is not an Obsidian vault`
	);
	const basePath = resolve(vaultPath, base);
	assert(
		"fixture",
		isWithin(vaultPath, basePath) && existsSync(basePath),
		`fixture is missing or escapes the vault: ${base}`
	);
	if (embed) {
		const embedPath = resolve(vaultPath, embed);
		assert(
			"fixture",
			isWithin(vaultPath, embedPath) && existsSync(embedPath),
			`embedded fixture is missing or escapes the vault: ${embed}`
		);
	}

	const contentBefore = await contentSnapshot(vaultPath, configPath);
	const pluginDirectory = resolve(configPath, "plugins", manifest.id);
	assert("deploy", isWithin(configPath, pluginDirectory), "resolved plugin directory escapes the config directory");
	await mkdir(pluginDirectory, { recursive: true });
	for (const file of PLUGIN_FILES) await copyFile(join(root, file), join(pluginDirectory, file));
	log(`deployed ${manifest.id} to ${vault}`);

	const artifacts = resolve(root, parsedArguments.values.get("artifacts") ?? ".oma/obsidian-host-test");
	await mkdir(artifacts, { recursive: true });
	let mobileEnabled = false;
	let deviceMetricsEnabled = false;
	let runError;
	let summary;

	const evalJson = (code, stage = "eval") => parseEvalJson(cliRun(["eval", `code=${code}`], stage), stage);
	const domSnapshot = (stage) => evalJson(DOM_SNAPSHOT, stage);
	const waitFor = async (stage, predicate) => {
		let last;
		for (let attempt = 0; attempt < 40; attempt += 1) {
			try {
				last = domSnapshot(stage);
			} catch (error) {
				if (!(error instanceof RetryableHostTestError)) throw error;
				last = { ready: false, retry: error.message };
			}
			if (predicate(last)) return last;
			await sleep(250);
		}
		fail(stage, `timed out waiting for the paginator; last snapshot: ${JSON.stringify(last)}`);
	};
	const openFixture = async (path, stage) => {
		const expectedPath = path.replaceAll("\\", "/");
		await cliEventually(["open", `path=${path}`], stage);
		return waitFor(
			stage,
			(snapshot) => snapshot.ready && snapshot.activePath === expectedPath && snapshot.rows > 0
		);
	};
	const clickButton = async (label) => {
		const labelLiteral = JSON.stringify(label);
		const rect = evalJson(
			`JSON.stringify((()=>{const scope=document.querySelector(".workspace-leaf.mod-active")??document;const button=[...scope.querySelectorAll(".bp-pagination-btn")].find(item=>item.getAttribute("aria-label")===${labelLiteral});if(!button)return null;const bounds=button.getBoundingClientRect();return {x:bounds.left+bounds.width/2,y:bounds.top+bounds.height/2,disabled:button.disabled};})())`,
			"cdp-input-locate"
		);
		assert("cdp-input", rect && !rect.disabled, `${label} is missing or disabled`);
		for (const type of ["mousePressed", "mouseReleased"]) {
			const params = { type, x: rect.x, y: rect.y, button: "left", clickCount: 1 };
			cliRun(["dev:cdp", "method=Input.dispatchMouseEvent", `params=${JSON.stringify(params)}`], "cdp-input");
		}
	};

	try {
		log("enable and reload plugin");
		cliRun(["plugin:enable", `id=${manifest.id}`], "plugin-enable");
		cliRun(["dev:errors", "clear"], "errors-clear");
		cliRun(["dev:console", "clear"], "console-clear");
		cliRun(["plugin:reload", `id=${manifest.id}`], "plugin-reload");
		cliRun(["plugin:reload", `id=${manifest.id}`], "plugin-reload");

		log("open direct base fixture");
		const first = await openFixture(base, "base-open");
		const firstPage = parsePageStatus(first.status);
		const firstItems = parseItemStatus(first.item);
		assert("base-view", first.containers === 1, `expected one active paginator, found ${first.containers}`);
		assert(
			"base-view",
			firstPage?.current === 1 && firstPage.total >= 2,
			`fixture must render at least two pages, got '${first.status}'`
		);
		assert(
			"base-view",
			firstItems?.start === 1 && firstItems.end === first.rows,
			`row/status mismatch: ${JSON.stringify(first)}`
		);
		assert(
			"base-view",
			first.fileLinks === first.rows,
			`expected one file link per row, got ${first.fileLinks} file links for ${first.rows} rows`
		);
		assert(
			"base-view",
			["10", "25", "50", "100", "custom"].every((value) => first.options.includes(value)),
			`page-size options are incomplete: ${first.options.join(", ")}`
		);
		assert(
			"base-view",
			first.inputMin === "1" && first.inputMax === "1000",
			`custom page-size bounds drifted: ${first.inputMin}..${first.inputMax}`
		);
		const expectedButtons = ["First page", "Previous page", "Next page", "Last page"];
		assert(
			"base-view",
			expectedButtons.every((label) => first.buttons.some((button) => button.label === label)),
			`navigation labels are incomplete: ${JSON.stringify(first.buttons)}`
		);
		assert(
			"base-view",
			first.buttons.find((button) => button.label === "First page")?.disabled === true,
			"first-page boundary is not disabled"
		);
		assert(
			"base-view",
			first.buttons.find((button) => button.label === "Next page")?.disabled === false,
			"next-page boundary is unexpectedly disabled"
		);

		log("navigate with CDP input");
		await clickButton("Next page");
		const second = await waitFor("next-page", (snapshot) => parsePageStatus(snapshot.status)?.current === 2);
		const secondItems = parseItemStatus(second.item);
		assert(
			"next-page",
			secondItems?.start === (firstItems?.end ?? 0) + 1,
			`page range did not advance: '${first.item}' -> '${second.item}'`
		);
		assert(
			"next-page",
			secondItems?.total === firstItems?.total,
			`total changed across navigation: '${first.item}' -> '${second.item}'`
		);
		assert(
			"next-page",
			second.rows <= first.rows && second.rows > 0,
			`second page is not bounded: ${second.rows} rows`
		);

		log("inspect accessibility tree");
		const axTree = parseJson(
			"accessibility",
			cliRun(["dev:cdp", "method=Accessibility.getFullAXTree", "params={}"], "accessibility")
		);
		const axValues = collectAxValues(axTree);
		for (const value of [...expectedButtons, "Items per page", second.status]) {
			assert("accessibility", axValues.includes(value), `accessibility tree is missing '${value}'`);
		}

		let embedded;
		if (embed) {
			log("open embedded fixture");
			embedded = await openFixture(embed, "embedded-view");
			assert(
				"embedded-view",
				parseItemStatus(embedded.item)?.total === firstItems?.total,
				`embedded total differs from the base: '${embedded.item}'`
			);
		}

		log("capture desktop and mobile screenshots");
		await openFixture(base, "base-reopen");
		const desktopScreenshot = join(artifacts, "desktop.png");
		cliRun(["dev:screenshot", `path=${desktopScreenshot}`], "desktop-screenshot");
		cliRun(["dev:mobile", "on"], "mobile-on");
		mobileEnabled = true;
		await cliEventually(
			[
				"dev:cdp",
				"method=Emulation.setDeviceMetricsOverride",
				`params=${JSON.stringify({ width: 390, height: 844, deviceScaleFactor: 1, mobile: true })}`,
			],
			"mobile-metrics-on"
		);
		deviceMetricsEnabled = true;
		const mobile = await openFixture(base, "mobile-view");
		const mobileMetrics = evalJson(
			`JSON.stringify({width:window.innerWidth,height:window.innerHeight,itemInfoFlexBasis:getComputedStyle(document.querySelector(".bp-item-info")).flexBasis})`,
			"mobile-metrics"
		);
		assert(
			"mobile-view",
			mobileMetrics.width === 390 && mobileMetrics.height === 844,
			`mobile viewport override failed: ${JSON.stringify(mobileMetrics)}`
		);
		assert(
			"mobile-view",
			mobileMetrics.itemInfoFlexBasis === "100%",
			`narrow-layout media query did not apply: ${JSON.stringify(mobileMetrics)}`
		);
		const mobileScreenshot = join(artifacts, "mobile.png");
		cliRun(["dev:screenshot", `path=${mobileScreenshot}`], "mobile-screenshot");
		await cliEventually(
			["dev:cdp", "method=Emulation.clearDeviceMetricsOverride", "params={}"],
			"mobile-metrics-off"
		);
		deviceMetricsEnabled = false;
		cliRun(["dev:mobile", "off"], "mobile-off");
		mobileEnabled = false;

		log("check error buffers and content integrity");
		const errors = await cliEventually(["dev:errors"], "errors");
		const consoleErrors = await cliEventually(["dev:console", "level=error"], "console-errors");
		assert("errors", /No errors captured\./i.test(errors), `Obsidian captured errors:\n${errors}`);
		assert(
			"console-errors",
			/No console messages captured\./i.test(consoleErrors),
			`Obsidian captured error-level console output:\n${consoleErrors}`
		);

		summary = {
			vault,
			vaultPath,
			pluginId: manifest.id,
			base,
			embed: embed ?? null,
			firstPage: first,
			secondPage: second,
			embedded: embedded ?? null,
			mobile: { rows: mobile.rows, ...mobileMetrics },
			accessibilityChecks: [...expectedButtons, "Items per page", second.status],
			artifacts: [desktopScreenshot, mobileScreenshot],
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
				cliRun(["dev:mobile", "off"], "mobile-cleanup");
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

	console.log(JSON.stringify({ status: "passed", contentFilesChecked: contentAfter.size, ...summary }, null, 2));
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
