import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth as _getAuth } from 'firebase-admin/auth';

let _app: App | null = null;

function getApp(): App {
  if (_app) return _app;
  const existing = getApps();
  if (existing.length > 0 && existing[0]) {
    _app = existing[0];
    return _app;
  }

  const serviceAccountJson = process.env['FIREBASE_SERVICE_ACCOUNT_JSON'];
  if (serviceAccountJson) {
    _app = initializeApp({
      credential: cert(JSON.parse(serviceAccountJson) as object),
      projectId: process.env['FIREBASE_PROJECT_ID'] ?? 'auto-recruit-kwangel',
    });
  } else {
    // Use application default credentials (Cloud Run / local gcloud auth)
    _app = initializeApp({
      projectId: process.env['FIREBASE_PROJECT_ID'] ?? 'auto-recruit-kwangel',
    });
  }
  return _app;
}

export function getAuth() {
  return _getAuth(getApp());
}
