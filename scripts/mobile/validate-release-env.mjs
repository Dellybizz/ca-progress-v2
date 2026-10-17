const platform = process.argv[2];
const required = platform === "android"
  ? ["CA_ANDROID_KEYSTORE_BASE64","CA_ANDROID_KEYSTORE_PASSWORD","CA_ANDROID_KEY_ALIAS","CA_ANDROID_KEY_PASSWORD"]
  : platform === "ios"
    ? ["CA_APPLE_CERTIFICATE_BASE64","CA_APPLE_CERTIFICATE_PASSWORD","CA_APPLE_PROVISION_PROFILE_BASE64","CA_APPLE_TEAM_ID"]
    : [];
if (!required.length) throw new Error("Usage: node scripts/mobile/validate-release-env.mjs <android|ios>");
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) throw new Error(`Missing ${platform} release secrets: ${missing.join(", ")}`);
console.log(`[mobile-release] ${platform} signing inputs are present.`);
