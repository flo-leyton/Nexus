import { auth, database, firebaseApp } from '../app/firebase';

export function testFirebaseInitialization() {
  console.log('Firebase initialized:', firebaseApp.name);
  console.log('Firebase Auth available:', Boolean(auth));
  console.log('Firebase RTDB available:', Boolean(database));
}