const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "content", "design", "refactor", "test", "chore", "docs"],
    ],
  },
};

export default config;
