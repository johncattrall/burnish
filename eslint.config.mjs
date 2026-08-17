import tseslint from "typescript-eslint";

// Diagnostic config mirroring the two type-checked rules the Obsidian community
// scorecard reports. Run: npx eslint src/
export default tseslint.config({
	files: ["src/**/*.ts"],
	extends: [tseslint.configs.base],
	languageOptions: {
		parserOptions: {
			project: "./tsconfig.json",
			tsconfigRootDir: import.meta.dirname,
		},
	},
	rules: {
		"@typescript-eslint/no-misused-promises": "warn",
		"@typescript-eslint/no-unnecessary-type-assertion": "warn",
	},
});
