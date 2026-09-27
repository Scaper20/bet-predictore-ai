import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  /*
   * Page widths belong to Container, not to call sites.
   *
   * `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8` had been copy-pasted into 25
   * files before it was collapsed into src/components/ui/container.tsx, which
   * meant the site had no single page width to change. This rule is what stops
   * that growing back: it fires in the editor at the moment someone pastes the
   * string, rather than in review a week later.
   *
   * Two selectors because class strings in this repo appear both as plain
   * attribute literals and inside the template literals used for class
   * merging (see TONES/BUTTONS in primitives.tsx).
   */
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/ui/container.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/max-w-(7xl|page|shell|\\[90rem\\]|\\[104rem\\])/]",
          message:
            "Use <Container> or containerClass() from @/components/ui/container instead of hardcoding a page width.",
        },
        {
          selector:
            "TemplateElement[value.raw=/max-w-(7xl|page|shell|\\[90rem\\]|\\[104rem\\])/]",
          message:
            "Use <Container> or containerClass() from @/components/ui/container instead of hardcoding a page width.",
        },
      ],
    },
  },
]);

export default eslintConfig;
