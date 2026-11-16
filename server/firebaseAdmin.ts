import { App } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from './src/config/firebaseAdmin.js';

export { getAdminApp } from './src/config/firebaseAdmin.js';

export function getAdminAuth(): Auth | null {
  const app = getAdminApp();
  if (!app) return null;
  return getAuth(app);
}

export function getAdminFirestore(): Firestore | null {
  const app = getAdminApp();
  if (!app) return null;
  const databaseId = process.env.FIREBASE_DATABASE_ID || '(default)';
  return getFirestore(app, databaseId);
}
