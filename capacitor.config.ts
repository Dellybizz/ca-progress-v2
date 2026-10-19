import type { CapacitorConfig } from "@capacitor/cli";

const platform = process.env.CAPACITOR_PLATFORM === "ios" ? "ios" : "android";
const liveReloadUrl = process.env.CAPACITOR_LIVE_RELOAD_URL;
const config: CapacitorConfig = {
  appId: "in.zanisheluxe.caprogress",
  appName: "CA Progress",
  webDir: "native-shell",
  appendUserAgent: ` CAProgressNative/${platform}/1`,
  // Release builds always load the installed webDir. A developer may opt into
  // live reload explicitly; CI and store builds never set this variable.
  ...(liveReloadUrl ? { server: { url: liveReloadUrl, cleartext: liveReloadUrl.startsWith("http://") } } : {}),
  ios: { contentInset: "always", preferredContentMode: "mobile" },
  android: { allowMixedContent: false, captureInput: true, webContentsDebuggingEnabled: false },
  plugins: {
    SplashScreen: { launchAutoHide: true, launchShowDuration: 1200, backgroundColor: "#ffffff", showSpinner: false },
    StatusBar: { style: "DEFAULT", overlaysWebView: false, backgroundColor: "#ffffff" },
    Keyboard: { resize: "native", resizeOnFullScreen: true },
  },
};

export default config;
