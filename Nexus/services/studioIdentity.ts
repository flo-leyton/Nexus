import { onAuthStateChanged, signInAnonymously, updateCurrentUser, type User } from 'firebase/auth';
import { auth } from '../config/firebase';
import { getOrCreateDeviceId } from './deviceIdentity';

let signingIn: Promise<unknown> | null = null;
// Firebase User retains its refresh capability. Keep it ONLY in memory, never copy
// tokens into app storage. An anonymous user abandoned before this code ran cannot
// be reconstructed from a deviceId, UID, code or RTDB record.
let previousUser: User | null = null;
let observedUser: User | null = auth?.currentUser ?? null;
export function rememberStudioIdentity() {
  if (auth?.currentUser?.isAnonymous) previousUser = auth.currentUser;
}
export function getPreviousStudioUser() {
  return previousUser && previousUser.uid !== auth?.currentUser?.uid ? previousUser : null;
}
export async function restorePreviousStudioIdentity() {
  const previous = getPreviousStudioUser();
  if (!auth || !previous) throw new Error('La identidad anónima anterior no está disponible. Un nuevo anónimo no recupera sus Sessions. Usa una instalación que todavía conserve esa identidad; sin esa prueba no es posible transferirla desde la app.');
  await previous.getIdToken(true);
  await updateCurrentUser(auth, previous);
}
export function forgetPreviousStudioIdentity() { previousUser = null; }
export async function getStudioCredentials() {
  if (!auth) throw new Error('Firebase no configurado. Configura EXPO_PUBLIC_FIREBASE_* para autenticar Studio.');
  try {
    await auth.authStateReady();
    if (!auth.currentUser) {
      if (previousUser) throw new Error('STUDIO_PREVIOUS_IDENTITY');
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
    if (error instanceof Error && error.message === 'STUDIO_PREVIOUS_IDENTITY') throw new Error('Hay una identidad anónima anterior recuperable en esta ejecución. Ve a Cuenta → RECUPERAR IDENTIDAD ANTERIOR antes de conectar.');
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
      throw new Error('Firebase Anonymous Authentication no está habilitado. Activa Anonymous en Authentication → Sign-in method.');
    }
    if (code === 'auth/network-request-failed') throw new Error('Sin acceso a Firebase Auth. Comprueba Internet antes de conectar al relay.');
    throw new Error('No se pudo obtener la identidad/token de Firebase para Studio. Revisa la configuración y vuelve a conectar.');
  }
}
export function subscribeStudioIdentity(listener: (uid: string | null) => void) {
  return auth ? onAuthStateChanged(auth, (user) => {
    if (observedUser?.isAnonymous && observedUser.uid !== user?.uid) previousUser = observedUser;
    observedUser = user;
    listener(user?.uid ?? null);
  }) : () => {};
}
