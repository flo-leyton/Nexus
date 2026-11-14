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

import { requireFirebase } from '../app/firebase';

export async function registerUser(email: string, password: string) {
  const { auth, database } = requireFirebase();
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
  const { auth, database } = requireFirebase();
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
  const { auth } = requireFirebase();
  await signOut(auth);
}

