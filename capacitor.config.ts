import type { CapacitorConfig } from "@capacitor/cli";

const platform = process.env.CAPACITOR_PLATFORM === "ios" ? "ios" : "android";
const config: CapacitorConfig = {
  appId: "in.zanisheluxe.caprogress",
  appName: "CA Progress",
  webDir: "native-shell",
  appendUserAgent: ` CAProgressNative/${platform}/1`,
  server: {
    url: "https://caprogress.zanisheluxe.in",
    cleartext: false,
    allowNavigation: ["caprogress.zanisheluxe.in"],
  },
  ios: { contentInset: "always", preferredContentMode: "mobile" },
  android: { allowMixedContent: false, captureInput: true, webContentsDebuggingEnabled: false },
  plugins: {
    SplashScreen: { launchAutoHide: true, launchShowDuration: 1200, backgroundColor: "#ffffff", showSpinner: false },
    StatusBar: { style: "DEFAULT", overlaysWebView: false, backgroundColor: "#ffffff" },
    Keyboard: { resize: "native", resizeOnFullScreen: true },
  },
};

export default config;
