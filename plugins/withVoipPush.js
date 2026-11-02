// #230 milestone 2 (1 Nov 2026): iPhone rings on a locked phone via Apple VoIP push (PushKit) + CallKit.
// Apple rule: every VoIP push must be reported to CallKit inside didReceiveIncomingPush, BEFORE JavaScript runs - so this
// plugin adds the PushKit delegate to the native AppDelegate (Swift, Expo SDK 58 template) and reports the call there with
// react-native-callkeep. JS (src/push) then picks the call up (answer / end) and starts the SIP registration.
// UNTESTED on a device: needs a Mac/EAS build + the Apple Developer enrolment (VoIP push needs the aps-environment
// entitlement and an APNs key). Payload keys come from ONE's softphone-push.service.ts (uuid, caller, callerNumber, company).
const { withAppDelegate, withDangerousMod, withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARK = '// AEM-VOIP-PUSH';

const EXTENSION = `
${MARK} - PushKit -> CallKit (see plugins/withVoipPush.js)
extension AppDelegate: PKPushRegistryDelegate {
  public func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
    RNVoipPushNotificationManager.didUpdate(pushCredentials, forType: type.rawValue)
  }

  public func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {}

  public func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
    let d = payload.dictionaryPayload
    let uuid = (d["uuid"] as? String) ?? UUID().uuidString
    let number = (d["callerNumber"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Unknown"
    let caller = (d["caller"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? number
    let company = (d["company"] as? String) ?? ""
    let name = company.isEmpty ? caller : "\\(caller) - \\(company)"
    RNVoipPushNotificationManager.addCompletionHandler(uuid, completionHandler: completion)
    RNVoipPushNotificationManager.didReceiveIncomingPush(with: payload, forType: type.rawValue)
    RNCallKeep.reportNewIncomingCall(uuid, handle: number, handleType: "number", hasVideo: false, localizedCallerName: name,
      supportsHolding: true, supportsDTMF: true, supportsGrouping: false, supportsUngrouping: false,
      fromPushKit: true, payload: d, withCompletionHandler: nil)
  }
}
`;

function withSwiftAppDelegate(config) {
  return withAppDelegate(config, (c) => {
    let src = c.modResults.contents;
    if (c.modResults.language !== 'swift') throw new Error('withVoipPush expects a Swift AppDelegate (Expo SDK 58)');
    if (src.includes(MARK)) return c;
    src = src.replace(/^(import React\s*$)/m, 'import PushKit\n$1');
    const ret = 'return super.application(application, didFinishLaunchingWithOptions: launchOptions)';
    if (!src.includes(ret)) throw new Error('withVoipPush: AppDelegate template changed - update the plugin');
    src = src.replace(ret, `RNVoipPushNotificationManager.voipRegistration() ${MARK}\n    ${ret}`);
    c.modResults.contents = src + EXTENSION;
    return c;
  });
}

// The Swift side needs the two Objective-C headers.
function withBridgingHeader(config) {
  return withDangerousMod(config, ['ios', async (c) => {
    const dir = path.join(c.modRequest.platformProjectRoot, c.modRequest.projectName);
    const file = fs.readdirSync(dir).find((f) => f.endsWith('-Bridging-Header.h'));
    if (!file) throw new Error('withVoipPush: no Bridging-Header.h in ' + dir);
    const p = path.join(dir, file);
    let h = fs.readFileSync(p, 'utf8');
    for (const imp of ['#import "RNVoipPushNotificationManager.h"', '#import "RNCallKeep.h"']) if (!h.includes(imp)) h += `\n${imp}`;
    fs.writeFileSync(p, h + '\n');
    return c;
  }]);
}

module.exports = (config) => {
  config = withSwiftAppDelegate(config);
  config = withBridgingHeader(config);
  config = withInfoPlist(config, (c) => {
    const m = new Set([...(c.modResults.UIBackgroundModes || []), 'voip', 'audio', 'remote-notification']);
    c.modResults.UIBackgroundModes = [...m];
    return c;
  });
  config = withEntitlementsPlist(config, (c) => {
    c.modResults['aps-environment'] = c.modResults['aps-environment'] || 'production';
    return c;
  });
  return config;
};
