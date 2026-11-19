import type { AuthCredential, User } from 'firebase/auth';

// Provider-independent: GoogleAuthProvider.credential and EmailAuthProvider.credential
// use the same safe link/collision path. No implicit sign-in on a collision.
export async function linkAnonymousCredential(user: User, credential: AuthCredential,
  link: (user: User, credential: AuthCredential) => Promise<{ user: User }>) {
  if (!user.isAnonymous) throw new Error('La vinculación requiere la identidad anónima original activa.');
  try {
    const result = await link(user, credential);
    if (result.user.uid !== user.uid) throw new Error('La vinculación cambió inesperadamente el UID. No se confirma continuidad.');
    return result;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (['auth/credential-already-in-use', 'auth/email-already-in-use', 'auth/account-exists-with-different-credential'].includes(code)) {
      throw Object.assign(new Error('Esa cuenta ya existe. Tu identidad anónima sigue activa. Para cambiar de cuenta, confirma el cambio y luego autoriza la transferencia en Studio demostrando ambas identidades.'), { code: 'STUDIO_ACCOUNT_COLLISION' });
    }
    throw error;
  }
}
