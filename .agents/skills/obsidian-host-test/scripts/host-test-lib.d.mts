export interface FixtureSet {
	id: string;
	tag: string;
	count: number;
	kind: "compact" | "standard" | "values";
}

export interface FixtureScenario {
	id: string;
	set?: string;
	tag: string;
	view: string;
	base: string;
	embed: string;
	pageSize: number;
	expectedTotal: number;
	expectedPages: number;
	[key: string]: unknown;
}

export interface FixtureSpec {
	version: 1;
	fixtureId: string;
	sets: FixtureSet[];
	scenarios: FixtureScenario[];
}

export interface SetupTargetState {
	adopt?: boolean;
	exists?: boolean;
	hasContent?: boolean;
	hasMarker?: boolean;
}

export class HostTestError extends Error {
	readonly stage: string;
	constructor(stage: string, message: string, options?: { cause?: unknown });
}

export function buildFixtureFiles(spec: FixtureSpec): Map<string, string>;
export function parseFixtureSpec(value: unknown): FixtureSpec;
export function parseVaultsVerbose(output: string, vaultName: string): string | undefined;
export function resolveVaultPath(
	vaultName: string,
	runTarget: (args: string[], stage: string) => string | Promise<string>,
	runGlobal: (args: string[], stage: string) => string | Promise<string>
): Promise<string>;
export function validateSetupTarget(target: string, options?: SetupTargetState): string;
