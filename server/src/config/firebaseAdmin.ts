import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { ENV } from './env.js';

let firebaseApp: App | null = null;

export function getAdminApp(): App | null {
  if (firebaseApp) return firebaseApp;

  if (getApps().length > 0) {
    firebaseApp = getApps()[0];
    return firebaseApp;
  }

  // 1. Check for JSON service account string
  if (ENV.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const parsed = JSON.parse(ENV.FIREBASE_SERVICE_ACCOUNT_JSON);
      firebaseApp = initializeApp({
        credential: cert(parsed),
        projectId: parsed.project_id || ENV.FIREBASE_PROJECT_ID
      });
      return firebaseApp;
    } catch (err) {
      console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT_JSON parsing error:', err);
    }
  }

  // 2. Check for individual credentials
  if (ENV.FIREBASE_CLIENT_EMAIL && ENV.FIREBASE_PRIVATE_KEY) {
    try {
      const privateKey = ENV.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
      firebaseApp = initializeApp({
        credential: cert({
          projectId: ENV.FIREBASE_PROJECT_ID,
          clientEmail: ENV.FIREBASE_CLIENT_EMAIL,
          privateKey
        }),
        projectId: ENV.FIREBASE_PROJECT_ID
      });
      return firebaseApp;
    } catch (err) {
      console.warn('⚠️ Firebase credentials initialization error:', err);
    }
  }

  // 3. Fallback for initialization with projectId only (e.g. metadata service or dev)
  try {
    firebaseApp = initializeApp({
      projectId: ENV.FIREBASE_PROJECT_ID
    });
    return firebaseApp;
  } catch (err) {
    console.warn('⚠️ Firebase Admin default app initialization note:', err);
    return null;
  }
}

export function getAdminAuth(): Auth | null {
  const app = getAdminApp();
  if (!app) return null;
  return getAuth(app);
}
