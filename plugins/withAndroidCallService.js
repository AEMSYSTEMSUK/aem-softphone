// #230 milestone 2 (1 Nov 2026): Android rings on a locked phone. ONE sends a high-priority FCM data message, the app's
// background handler (src/push/index.ts, runs even when the app was swiped away) hands the call to Android's Telecom
// framework through react-native-callkeep's ConnectionService - that shows the system incoming-call screen over the lock
// screen, then the app starts its SIP registration and answers the matching INVITE.
// @config-plugins/react-native-callkeep adds the services; this adds the permissions Android 13/14+ insists on.
const { withAndroidManifest } = require('expo/config-plugins');

const PERMS = [
  'android.permission.MANAGE_OWN_CALLS',
  'android.permission.READ_PHONE_STATE',
  'android.permission.CALL_PHONE',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_PHONE_CALL',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.USE_FULL_SCREEN_INTENT',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.WAKE_LOCK',
  'android.permission.BLUETOOTH_CONNECT',
];

module.exports = (config) => withAndroidManifest(config, (c) => {
  const m = c.modResults.manifest;
  m['uses-permission'] = m['uses-permission'] || [];
  for (const p of PERMS) if (!m['uses-permission'].some((x) => x.$['android:name'] === p)) m['uses-permission'].push({ $: { 'android:name': p } });
  // Android 14: a phone-call foreground service must declare phoneCall (and microphone, as the call uses the mic).
  // Expo runs this mod BEFORE @config-plugins/react-native-callkeep's (last plugin first), so declare the service here
  // in full; callkeep's plugin then sees it exists and leaves it alone.
  const app = m.application?.[0];
  app.service = app.service || [];
  let svc = app.service.find((x) => x.$['android:name'] === 'io.wazo.callkeep.VoiceConnectionService');
  if (!svc) {
    svc = { $: { 'android:name': 'io.wazo.callkeep.VoiceConnectionService' }, 'intent-filter': [{ action: [{ $: { 'android:name': 'android.telecom.ConnectionService' } }] }] };
    app.service.push(svc);
  }
  Object.assign(svc.$, {
    'android:exported': 'true', 'android:label': 'The One MSP Phone',
    'android:permission': 'android.permission.BIND_TELECOM_CONNECTION_SERVICE', 'android:foregroundServiceType': 'phoneCall|microphone',
  });
  return c;
});
