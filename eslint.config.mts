import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						"manifest.json",
						".agents/skills/obsidian-host-test/scripts/*.mjs",
						"scripts/release/*.mjs",
					],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: [".json"],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		files: ["tests/**/*.ts", "vitest.config.ts"],
		languageOptions: { globals: { ...globals.node } },
		rules: {
			"obsidianmd/no-nodejs-modules": "off",
			"obsidianmd/no-static-styles-assignment": "off",
			"obsidianmd/prefer-create-el": "off",
		},
	},
	{
		files: [".agents/skills/**/*.{mjs,mts}", "scripts/release/*.mjs"],
		languageOptions: { globals: { ...globals.node } },
		rules: {
			"obsidianmd/no-nodejs-modules": "off",
			"obsidianmd/prefer-window-timers": "off",
			"obsidianmd/rule-custom-message": "off",
		},
	},
	globalIgnores([
		".oma",
		".worktrees",
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"eslint.config.mts",
		"version-bump.mjs",
		"versions.json",
		"main.js",
	])
);
