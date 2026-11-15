import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { auth } from '../app/firebase';
import { getOrCreateDeviceId } from './deviceIdentity';

let signingIn: Promise<unknown> | null = null;
export async function getStudioCredentials() {
  if (!auth) throw new Error('Firebase no configurado. Configura EXPO_PUBLIC_FIREBASE_* para autenticar Studio.');
  try {
    await auth.authStateReady();
    if (!auth.currentUser) {
      if (!signingIn) signingIn = signInAnonymously(auth).finally(() => { signingIn = null; });
      await signingIn;
    }
    const user = auth.currentUser;
    if (!user) throw new Error('AUTH_NO_USER');
    const idToken = await user.getIdToken(true);
    const deviceId = await getOrCreateDeviceId();
    if (auth.currentUser?.uid !== user.uid) throw new Error('AUTH_USER_CHANGED');
    return { uid: user.uid, idToken, deviceId };
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
      throw new Error('Firebase Anonymous Authentication no está habilitado. Activa Anonymous en Authentication → Sign-in method.');
    }
    if (code === 'auth/network-request-failed') throw new Error('Sin acceso a Firebase Auth. Comprueba Internet antes de conectar al relay.');
    throw new Error('No se pudo obtener la identidad/token de Firebase para Studio. Revisa la configuración y vuelve a conectar.');
  }
}
export function subscribeStudioIdentity(listener: (uid: string | null) => void) {
  return auth ? onAuthStateChanged(auth, (user) => listener(user?.uid ?? null)) : () => {};
}
