import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    EmailAuthProvider,
    linkWithCredential,
    type AuthCredential,
} from 'firebase/auth';
import {
    ref,
    serverTimestamp,
    set,
    update,
} from 'firebase/database';

import { requireFirebase } from '../config/firebase';
import { rememberStudioIdentity } from './studioIdentity';
import { linkAnonymousCredential } from './identityLink';

export async function linkStudioCredential(credential: AuthCredential) {
  const { auth } = requireFirebase();
  if (!auth.currentUser) throw new Error('Abre Studio primero para recuperar tu identidad anónima.');
  return linkAnonymousCredential(auth.currentUser, credential, linkWithCredential);
}

export async function registerUser(email: string, password: string) {
  const { auth, database } = requireFirebase();
  const normalizedEmail = email.trim().toLowerCase();

  const credential = auth.currentUser?.isAnonymous
    ? await linkStudioCredential(EmailAuthProvider.credential(normalizedEmail, password))
    : await createUserWithEmailAndPassword(
    auth,
    normalizedEmail,
    password,
  );

  await set(ref(database, `users/${credential.user.uid}`), {
    email: credential.user.email,
    createdAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  });

  return credential.user;
}

export async function loginUser(email: string, password: string, allowAccountChange = false) {
  const { auth, database } = requireFirebase();
  const normalizedEmail = email.trim().toLowerCase();

  rememberStudioIdentity();
  const credential = auth.currentUser?.isAnonymous && !allowAccountChange
    ? await linkStudioCredential(EmailAuthProvider.credential(normalizedEmail, password))
    : await signInWithEmailAndPassword(
    auth,
    normalizedEmail,
    password,
  );

  await update(ref(database, `users/${credential.user.uid}`), {
    lastLoginAt: serverTimestamp(),
  });

  return credential.user;
}

export async function logoutUser() {
  const { auth } = requireFirebase();
  rememberStudioIdentity();
  await signOut(auth);
}

