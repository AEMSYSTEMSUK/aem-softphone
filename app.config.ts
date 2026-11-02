import type { ExpoConfig, ConfigContext } from 'expo/config';

// #230 milestone 2 (1 Nov 2026): app.json holds the static config; this adds what depends on the build.
//   GOOGLE_SERVICES_JSON = path to the Firebase google-services.json (Android push). Supplied by the build (GitHub Actions
//   secret / EAS file env) - NEVER committed. Without it the app still builds, it just can't ring when locked.
//   ONE_API_BASE         = optional ONE address override (e.g. a staging ONE).
export default ({ config }: ConfigContext): ExpoConfig => {
  const gsf = process.env.GOOGLE_SERVICES_JSON;
  const firebase = ['@react-native-firebase/app', '@react-native-firebase/messaging'];
  const plugins = (config.plugins || []).filter((p) => (gsf ? true : !firebase.includes(String(Array.isArray(p) ? p[0] : p))));
  return {
    ...config,
    name: config.name || 'The One MSP Phone',
    slug: config.slug || 'theonemsp-phone',
    plugins: [
      ...plugins,
      './plugins/withVoipPush', // iOS PushKit -> CallKit in native (Apple requires the CallKit report before JS runs)
      './plugins/withAndroidCallService', // Android: ring on the lock screen (full-screen intent + foreground service)
    ],
    android: { ...config.android, ...(gsf ? { googleServicesFile: gsf } : {}) },
    extra: { ...config.extra, ...(process.env.ONE_API_BASE ? { apiBase: process.env.ONE_API_BASE } : {}), pushAndroid: !!gsf },
  };
};
