const path = require("node:path");

const { signQuickLookExtensions } = require("./sign-macos-quicklook.cjs");

module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== "darwin" || process.env.MAUTH_QUICKLOOK_AFTER_SIGN !== "1") return;
  const appBundle = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  signQuickLookExtensions(appBundle);
};
