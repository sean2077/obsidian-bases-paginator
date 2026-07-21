import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const RELEASE_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.([1-9]\d*))?$/u;

const PRERELEASE_RANK = {
	alpha: 0,
	beta: 1,
	rc: 2,
};

export const RELEASE_FILE_NAMES = [
	"package.json",
	"package-lock.json",
	"manifest.json",
	"src/version.ts",
	"versions.json",
];

export function parseReleaseVersion(value) {
	const match = RELEASE_VERSION_PATTERN.exec(value);
	if (!match) {
		throw new Error(
			`Invalid release version "${value}". Use X.Y.Z or X.Y.Z-(alpha|beta|rc).N without a leading v.`
		);
	}

	return {
		raw: value,
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
		prerelease: match[4]
			? {
					phase: match[4],
					number: Number(match[5]),
				}
			: null,
	};
}

export function compareReleaseVersions(leftValue, rightValue) {
	const left = parseReleaseVersion(leftValue);
	const right = parseReleaseVersion(rightValue);

	for (const key of ["major", "minor", "patch"]) {
		const difference = left[key] - right[key];
		if (difference !== 0) return Math.sign(difference);
	}

	if (left.prerelease === null && right.prerelease === null) return 0;
	if (left.prerelease === null) return 1;
	if (right.prerelease === null) return -1;

	const phaseDifference = PRERELEASE_RANK[left.prerelease.phase] - PRERELEASE_RANK[right.prerelease.phase];
	if (phaseDifference !== 0) return Math.sign(phaseDifference);
	return Math.sign(left.prerelease.number - right.prerelease.number);
}

export function releasePaths(root) {
	return Object.fromEntries(RELEASE_FILE_NAMES.map((file) => [file, resolve(root, file)]));
}

export function readReleaseSnapshot(root) {
	const paths = releasePaths(root);
	const packageJson = readJson(paths["package.json"]);
	const packageLock = readJson(paths["package-lock.json"]);
	const manifest = readJson(paths["manifest.json"]);
	const versions = readJson(paths["versions.json"]);
	const versionSource = readFileSync(paths["src/version.ts"], "utf8");
	const sourceMatches = [...versionSource.matchAll(/export const VERSION = "([^"]+)";/gu)];

	if (sourceMatches.length !== 1) {
		throw new Error('src/version.ts must contain exactly one export const VERSION = "..."; declaration.');
	}

	return {
		paths,
		packageJson,
		packageLock,
		manifest,
		versions,
		versionSource,
		sourceVersion: sourceMatches[0][1],
	};
}

export function assertVersionAlignment(snapshot, expectedVersion = snapshot.packageJson.version) {
	parseReleaseVersion(expectedVersion);

	const versions = {
		"package.json": snapshot.packageJson.version,
		"package-lock.json": snapshot.packageLock.version,
		'package-lock.json packages[""]': snapshot.packageLock.packages?.[""]?.version,
		"manifest.json": snapshot.manifest.version,
		"src/version.ts": snapshot.sourceVersion,
	};

	for (const [source, actualVersion] of Object.entries(versions)) {
		if (actualVersion !== expectedVersion) {
			throw new Error(`${source} has version ${JSON.stringify(actualVersion)}; expected ${expectedVersion}.`);
		}
	}

	const minimumAppVersion = snapshot.manifest.minAppVersion;
	if (typeof minimumAppVersion !== "string" || minimumAppVersion.length === 0) {
		throw new Error("manifest.json minAppVersion must be a non-empty string.");
	}
	if (snapshot.versions[expectedVersion] !== minimumAppVersion) {
		throw new Error(`versions.json must map ${expectedVersion} to manifest minAppVersion ${minimumAppVersion}.`);
	}
}

export function replaceSourceVersion(source, targetVersion) {
	const matches = [...source.matchAll(/export const VERSION = "([^"]+)";/gu)];
	if (matches.length !== 1) {
		throw new Error('src/version.ts must contain exactly one export const VERSION = "..."; declaration.');
	}
	return source.replace(matches[0][0], `export const VERSION = "${targetVersion}";`);
}

export function extractReleaseNotes(changelog, exactTag) {
	if (
		typeof exactTag !== "string" ||
		exactTag.length === 0 ||
		exactTag.includes("\0") ||
		exactTag.includes("\r") ||
		exactTag.includes("\n")
	) {
		throw new Error("The exact release tag must be one non-empty line without NUL.");
	}

	const normalized = changelog.replace(/^\uFEFF/u, "").replaceAll("\r\n", "\n");
	const lines = scanChangelogLines(normalized);
	const headingMatches = lines.filter((record) => record.outsideFence && isLevelTwoHeading(record.line));
	if (headingMatches.length === 0) {
		throw new Error("CHANGELOG.md has no level-two release sections.");
	}

	const targetPrefix = `## [${exactTag}]`;
	const targets = lines.filter((record) => record.outsideFence && record.line.startsWith(targetPrefix));

	if (targets.length !== 1) {
		throw new Error(
			`CHANGELOG.md must contain exactly one heading for exact tag ${JSON.stringify(exactTag)}; found ${targets.length}.`
		);
	}

	const target = targets[0];
	const canonical = /^(?:\([^\n)]+\))? \((\d{4}-\d{2}-\d{2})\)[ \t]*$/u.exec(target.line.slice(targetPrefix.length));
	if (!canonical) {
		throw new Error(
			`CHANGELOG.md heading for ${JSON.stringify(exactTag)} must end with a valid (YYYY-MM-DD) date.`
		);
	}
	if (!isValidCalendarDate(canonical[1])) {
		throw new Error(`CHANGELOG.md heading for ${JSON.stringify(exactTag)} has an invalid calendar date.`);
	}

	if (target.start !== headingMatches[0].start) {
		throw new Error(`CHANGELOG.md section ${exactTag} must be the newest level-two section.`);
	}

	const nextHeading = headingMatches.find((heading) => heading.start > target.start);
	const notes = normalized.slice(target.end, nextHeading?.start ?? normalized.length).trim();

	if (notes.length === 0) {
		throw new Error(`CHANGELOG.md section ${exactTag} has no release notes.`);
	}

	return `${notes}\n`;
}

function scanChangelogLines(text) {
	const records = [];
	let offset = 0;
	let fenceCharacter = null;
	let fenceSize = 0;

	while (offset < text.length) {
		const newline = text.indexOf("\n", offset);
		const end = newline === -1 ? text.length : newline + 1;
		const rawLine = text.slice(offset, end);
		const line = rawLine.endsWith("\n") ? rawLine.slice(0, -1) : rawLine;
		const outsideFence = fenceCharacter === null;
		records.push({ start: offset, end, line, outsideFence });

		if (outsideFence) {
			const opening = /^[ ]{0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
			if (opening && !(opening[1][0] === "`" && opening[2].includes("`"))) {
				fenceCharacter = opening[1][0];
				fenceSize = opening[1].length;
			}
		} else {
			const closing = /^[ ]{0,3}(`+|~+)[ \t]*$/u.exec(line);
			if (closing && closing[1][0] === fenceCharacter && closing[1].length >= fenceSize) {
				fenceCharacter = null;
				fenceSize = 0;
			}
		}

		offset = end;
	}

	return records;
}

function isLevelTwoHeading(line) {
	return /^##(?:[ \t]+|$)/u.test(line);
}

function isValidCalendarDate(value) {
	const [year, month, day] = value.split("-").map(Number);
	if (year < 1 || month < 1 || month > 12 || day < 1) return false;
	const daysInMonth = [
		31,
		year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
		31,
		30,
		31,
		30,
		31,
		31,
		30,
		31,
		30,
		31,
	];
	return day <= daysInMonth[month - 1];
}

export function formatJson(value) {
	return `${JSON.stringify(value, null, "\t")}\n`;
}

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}
