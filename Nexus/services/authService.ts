import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  ref,
  serverTimestamp,
  set,
  update,
} from 'firebase/database';

import { auth, database } from './firebase';

export async function registerUser(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();

  const credential = await createUserWithEmailAndPassword(
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

export async function loginUser(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();

  const credential = await signInWithEmailAndPassword(
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
  await signOut(auth);
}