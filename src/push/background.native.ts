import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { handleIncomingPush } from './index';

// Android: FCM data messages while the app is in the background or was swiped away run here (headless JS) - must be
// registered at start-up, outside React (imported first thing from index.ts). iPhone pushes come through PushKit instead.
if (Platform.OS === 'android' && (Constants.expoConfig?.extra as { pushAndroid?: boolean } | undefined)?.pushAndroid) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const messaging = require('@react-native-firebase/messaging').default;
  messaging().setBackgroundMessageHandler(async (m: { data?: Record<string, unknown> }) => { await handleIncomingPush(m.data); });
}
