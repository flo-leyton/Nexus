import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import { getDatabase } from 'firebase/database';
// Expo requires direct property access to inline EXPO_PUBLIC values in the bundle.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);
export const firebaseApp = !isFirebaseConfigured ? null :
  getApps().length === 0
    ? initializeApp(firebaseConfig)
    : getApp();

let firebaseAuth: Auth | null = null;

if (firebaseApp) {
  try {
    firebaseAuth = initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    firebaseAuth = getAuth(firebaseApp);
  }
}
export const auth = firebaseAuth;
export const database = firebaseApp ? getDatabase(firebaseApp) : null;

export function requireFirebase() {
  if (!auth || !database) throw new Error('Firebase no configurado. Configura EXPO_PUBLIC_FIREBASE_* para usar la cuenta.');
  return { auth, database };
}
