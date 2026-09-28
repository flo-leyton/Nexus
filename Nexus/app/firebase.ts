import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import { getDatabase } from 'firebase/database';

function requiredEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing Firebase environment variable: ${name}`);
  }

  return value;
}

const firebaseConfig = {
  apiKey: requiredEnv(
    'EXPO_PUBLIC_FIREBASE_API_KEY',
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  ),

  authDomain: requiredEnv(
    'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  ),

  databaseURL: requiredEnv(
    'EXPO_PUBLIC_FIREBASE_DATABASE_URL',
    process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
  ),

  projectId: requiredEnv(
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  ),

  storageBucket: requiredEnv(
    'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  ),

  messagingSenderId: requiredEnv(
    'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  ),

  appId: requiredEnv(
    'EXPO_PUBLIC_FIREBASE_APP_ID',
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  ),
};

export const firebaseApp =
  getApps().length === 0
    ? initializeApp(firebaseConfig)
    : getApp();

let firebaseAuth: Auth;

try {
  firebaseAuth = initializeAuth(firebaseApp, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {



  firebaseAuth = getAuth(firebaseApp);
}



export const auth = firebaseAuth;
export const database = getDatabase(firebaseApp);