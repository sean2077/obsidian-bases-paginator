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
					allowDefaultProject: ["manifest.json"],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: [".json"],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		files: ["tests/**/*.ts", "vitest.config.ts"],
		rules: {
			"obsidianmd/no-nodejs-modules": "off",
			"obsidianmd/no-static-styles-assignment": "off",
			"obsidianmd/prefer-create-el": "off",
		},
	},
	{
		// Declarative settings are 1.13-only; public stable compatibility remains 1.12.
		files: ["src/settings.ts"],
		rules: { "obsidianmd/settings-tab/prefer-setting-definitions": "off" },
	},
	globalIgnores([
		".oma",
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"eslint.config.mts",
		"version-bump.mjs",
		"versions.json",
		"main.js",
	])
);
