import js from "@eslint/js";
export default [
  { ignores: ["**/node_modules/**", "**/dist/**", "**/target/**", "**/coverage/**"] },
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module"
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
    }
  }
];
