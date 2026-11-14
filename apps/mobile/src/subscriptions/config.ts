export function purchaseConfigurationIssue(
  platform: string,
  key: string | undefined,
  expoGo: boolean,
  allowTestStore = false,
) {
  if (expoGo) return "Purchases need an installed native build, not Expo Go.";
  if (platform !== "ios" && platform !== "android")
    return "Purchases are available in the iOS and Android app.";
  if (!key)
    return "The public RevenueCat SDK key is missing for this platform. Configure it and rebuild.";
  if (allowTestStore && key.startsWith("test_")) return null;
  if (!key.startsWith(platform === "ios" ? "appl_" : "goog_"))
    return "Use this platform's public store SDK key, not a secret API key or Test Store key, then rebuild.";
  return null;
}
