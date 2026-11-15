import { onAuthStateChanged } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { Alert, Pressable } from 'react-native';
import { auth } from '../app/firebase';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { forgetPreviousStudioIdentity, getPreviousStudioUser, restorePreviousStudioIdentity } from '../services/studioIdentity';
import { connectSocket, transferSocketIdentity } from '../services/socket';

export function StudioIdentityPanel() {
  const [uid, setUid] = useState(auth?.currentUser?.uid ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => auth ? onAuthStateChanged(auth, (user) => setUid(user?.uid ?? '')) : undefined, []);
  const previous = getPreviousStudioUser();
  const run = async (transfer: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (transfer) {
        if (!previous || !auth?.currentUser || auth.currentUser.uid !== uid) throw new Error('Falta una de las identidades; no se transfirió propiedad.');
        const proof = await previous.getIdToken(true);
        await transferSocketIdentity(proof, uid);
        forgetPreviousStudioIdentity();
        setMessage('Transferencia confirmada y persistida por el relay. Studio consultará tus Sessions.');
      } else {
        await restorePreviousStudioIdentity();
        connectSocket();
        setMessage('Identidad original recuperada. Conectando con un token actual.');
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo verificar la identidad anterior.'); }
    finally { setBusy(false); }
  };
  return <ThemedView style={{ gap: 10 }}>
    <ThemedText selectable>UID actual: {uid || 'Sin cuenta activa'}</ThemedText>
    {previous ? <>
      <ThemedText selectable>Identidad anónima anterior disponible en esta ejecución: {previous.uid}</ThemedText>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run(false)}>
        <ThemedText type="link">RECUPERAR IDENTIDAD ANTERIOR</ThemedText>
      </Pressable>
      {!!uid && <Pressable accessibilityRole="button" disabled={busy} onPress={() => Alert.alert('Transferir esta instalación',
        `El relay verificará ambas cuentas y transferirá las membresías y Sessions de esta instalación desde ${previous.uid} hacia ${uid}. No combina otras instalaciones ni cambia los Nodes históricos.`,
        [{ text: 'Cancelar', style: 'cancel' }, { text: 'Autorizar transferencia', onPress: () => void run(true) }])}>
        <ThemedText type="link">TRANSFERIR A LA CUENTA ACTUAL</ThemedText>
      </Pressable>}
    </> : <ThemedText>Si cambiaste de cuenta antes de esta versión y perdiste el usuario anónimo original, no se puede recuperarlo con el código o deviceId. No borres datos: usa una instalación que aún conserve esa identidad. Sin esa prueba la app no puede transferir sus Sessions.</ThemedText>}
    {!!message && <ThemedText accessibilityLiveRegion="polite">{message}</ThemedText>}
  </ThemedView>;
}
