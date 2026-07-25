import js from "@eslint/js";

export default [
  { ignores: ["dist", "node_modules", "src/durable-objects"] },
  {
    ...js.configs.recommended,
    files: ["src/**/*.ts"],
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-undef": "off",
    },
  },
];
