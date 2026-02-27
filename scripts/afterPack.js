/**
 * afterPack.js — electron-builder hook
 *
 * Runs after the app is packed into a .app bundle but BEFORE the DMG is
 * created.  We use it to ad-hoc sign every macOS build so that Apple Silicon
 * Macs don't show "damaged and can't be opened" (which happens when an app
 * has no code signature at all).
 *
 * Ad-hoc signing (-) is NOT the same as Apple-notarised signing, but it:
 *   • Removes the "damaged" error on Apple Silicon
 *   • Changes the Gatekeeper prompt to "unidentified developer" which users
 *     can bypass with right-click → Open
 *   • Requires no Apple Developer account or certificate
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function afterPack(context) {
  // Only sign on macOS builds
  if (context.electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  if (!fs.existsSync(appPath)) {
    console.warn(`[afterPack] App not found at: ${appPath} — skipping sign`);
    return;
  }

  console.log(`[afterPack] Ad-hoc signing: ${appPath}`);
  try {
    // --deep  : recursively sign nested frameworks/helpers
    // --force : re-sign if already signed (idempotent)
    // --sign - : ad-hoc identity (no certificate required)
    execSync(`codesign --deep --force --sign - "${appPath}"`, {
      stdio: 'inherit',
    });
    console.log(`[afterPack] ✓ Ad-hoc signed successfully`);
  } catch (err) {
    // Non-fatal — app will still build, just without a signature
    console.error(`[afterPack] ✗ codesign failed (app will still build):`, err.message);
  }
};
