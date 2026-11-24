import { createRequire } from "node:module";
import { defineConfig, globalIgnores } from "eslint/config";

// Load Next.js 16 ESLint plugins directly via eslint-config-next so ESLint runs
// cleanly alongside TypeScript 7.0 (which typescript-eslint@8 does not yet support).
const requireFromNext = createRequire(new URL("./node_modules/eslint-config-next/package.json", import.meta.url));
const nextPlugin = requireFromNext("@next/eslint-plugin-next");
const reactPlugin = requireFromNext("eslint-plugin-react");
const reactHooksPlugin = requireFromNext("eslint-plugin-react-hooks");
const jsxA11yPlugin = requireFromNext("eslint-plugin-jsx-a11y");
const globals = requireFromNext("globals");
const nextParser = requireFromNext("./dist/parser");
const { fixupPluginRules } = requireFromNext("./dist/rule-context");

const eslintConfig = defineConfig([
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", ".data/**"]),
  {
    name: "next-core-web-vitals",
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    plugins: {
      react: fixupPluginRules(reactPlugin),
      "react-hooks": reactHooksPlugin,
      "jsx-a11y": jsxA11yPlugin,
      "@next/next": nextPlugin,
    },
    languageOptions: {
      parser: nextParser,
      parserOptions: {
        requireConfigFile: false,
        sourceType: "module",
        allowImportExportEverywhere: true,
        babelOptions: {
          presets: ["next/babel"],
          caller: {
            supportsTopLevelAwait: true,
          },
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "react/no-unknown-property": "off",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/jsx-no-target-blank": "off",
      "jsx-a11y/alt-text": ["warn", { elements: ["img"], img: ["Image"] }],
      "jsx-a11y/aria-props": "warn",
      "jsx-a11y/aria-proptypes": "warn",
      "jsx-a11y/aria-unsupported-elements": "warn",
      "jsx-a11y/role-has-required-aria-props": "warn",
      "jsx-a11y/role-supports-aria-props": "warn",
    },
  },
]);

export default eslintConfig;
