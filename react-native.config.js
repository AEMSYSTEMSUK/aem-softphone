// Android rings via Firebase (FCM); iPhone rings via Apple VoIP push (PushKit). Keep each push library on its own
// platform so iOS doesn't need a Firebase plist and Android doesn't build PushKit code.
module.exports = {
  dependencies: {
    '@react-native-firebase/app': { platforms: { ios: null } },
    '@react-native-firebase/messaging': { platforms: { ios: null } },
    'react-native-voip-push-notification': { platforms: { android: null } },
  },
};
