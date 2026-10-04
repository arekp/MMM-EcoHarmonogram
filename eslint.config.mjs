import js from "@eslint/js";
import globals from "globals";
import stylistic from "@stylistic/eslint-plugin";

export default [
	{ ignores: ["node_modules/**"] },
	js.configs.recommended,
	{
		files: ["**/*.js"],
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "commonjs",
			globals: { ...globals.node }
		},
		plugins: { "@stylistic": stylistic },
		rules: {
			"@stylistic/indent": ["error", "tab"],
			"@stylistic/quotes": ["error", "double", { avoidEscape: true }],
			"@stylistic/semi": ["error", "always"],
			"@stylistic/comma-dangle": ["error", "never"],
			"@stylistic/space-before-function-paren": ["error", "always"],
			"prefer-const": "error",
			"no-var": "error"
		}
	},
	{
		files: ["MMM-EcoHarmonogram.js"],
		languageOptions: {
			sourceType: "script",
			globals: { ...globals.browser, Module: "readonly", Log: "readonly", moment: "readonly" }
		}
	}
];
