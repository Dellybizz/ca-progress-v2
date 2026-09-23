import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([".next/**", ".open-next/**", "native-shell/assets/**", "android/app/src/main/assets/public/**", "ios/App/App/public/**", "cloudflare-env.d.ts"]),
]);
