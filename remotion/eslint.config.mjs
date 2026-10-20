import { config } from "@remotion/eslint-config-flat";

export default [
  {
    ignores: [
      "node_modules/**",
      "out/**",
      "public/**",
      "scripts/**",
      ".agents/**",
      ".devin/**",
      "docs/**",
    ],
  },
  ...config,
  {
    rules: {
      // This dir uses double quotes (create-video scaffold + IDE formatter).
      // The upstream config wants single quotes — disable to stop churn.
      quotes: "off",
    },
  },
];
