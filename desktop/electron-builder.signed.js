// The One MSP Phone desktop: the package.json "build" config plus Azure Trusted Signing (7 Nov 2026). Used by
// `npm run dist:win:signed` (build/release.ps1). electron-builder signs the app exe, the uninstaller and the installer.
// Same account and profile as the Windows agent (CLAUDE.md, Agent release). Nothing secret here: the sign-in is Andy's own
// Connect-AzAccount in the same PowerShell window. TRUSTED_SIGNING_* env vars override the defaults.
const base = require('./package.json').build;

module.exports = {
  ...base,
  win: {
    ...base.win,
    azureSignOptions: {
      publisherName: 'AEM SYSTEMS (YORKSHIRE) LTD',
      endpoint: process.env.TRUSTED_SIGNING_ENDPOINT || 'https://neu.codesigning.azure.net/',
      codeSigningAccountName: process.env.TRUSTED_SIGNING_ACCOUNT || 'aemsystems-signing',
      certificateProfileName: process.env.TRUSTED_SIGNING_PROFILE || 'aemsystems-public',
    },
  },
};
