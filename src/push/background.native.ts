import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { handleIncomingPush } from './index';
import { getEngine } from '../state/phoneCore';

// Android: FCM data messages while the app is in the background or was swiped away run here (headless JS) - must be
// registered at start-up, outside React (imported first thing from index.ts). iPhone pushes come through PushKit instead.
// 3 Nov 2026: getEngine() wires the phone core first, so the 'incoming' event signs the lines in straight away (headless)
// and voip1's INVITE reaches us while the lock screen is still ringing.
if (Platform.OS === 'android' && (Constants.expoConfig?.extra as { pushAndroid?: boolean } | undefined)?.pushAndroid) {
  // 9 Nov 2026: RNFirebase v27 has no default (namespaced) export - `.default()` threw at start-up and closed the app on
  // launch. Modular API only, and never let push setup stop the app opening.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fm = require('@react-native-firebase/messaging');
    fm.setBackgroundMessageHandler(fm.getMessaging(), async (m: { data?: Record<string, unknown> }) => {
      getEngine();
      await handleIncomingPush(m.data);
    });
  } catch (e) {
    console.warn('push: background handler not set', e);
  }
}
