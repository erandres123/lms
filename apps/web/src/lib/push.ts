import { getApps, initializeApp } from 'firebase/app';
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type Messaging,
} from 'firebase/messaging';
import { api } from './api';

const SW_PATH = '/firebase-messaging-sw.js';
const APP_NAME = 'lms-web-push';

export type PushStatus = 'unsupported' | 'unconfigured' | 'default' | 'granted' | 'denied';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

function firebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.projectId &&
      firebaseConfig.messagingSenderId &&
      firebaseConfig.appId &&
      vapidKey,
  );
}

export function pushStatus(): PushStatus {
  if (typeof window === 'undefined') return 'unsupported';
  if (
    !('serviceWorker' in navigator) ||
    !('Notification' in window) ||
    !('PushManager' in window)
  ) {
    return 'unsupported';
  }
  if (!firebaseConfigured()) return 'unconfigured';
  return Notification.permission;
}

async function getMessagingInstance(): Promise<Messaging | null> {
  if (!firebaseConfigured() || !(await isSupported())) return null;
  const app =
    getApps().find((candidate) => candidate.name === APP_NAME) ??
    initializeApp(firebaseConfig, APP_NAME);
  return getMessaging(app);
}

async function register(
  authToken: string,
  askPermission: boolean,
): Promise<PushStatus> {
  const status = pushStatus();
  if (status !== 'default' && status !== 'granted') return status;

  let permission = Notification.permission;
  if (permission === 'default') {
    if (!askPermission) return 'default';
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') return 'denied';

  const messaging = await getMessagingInstance();
  if (!messaging) return 'unsupported';

  const registration = await navigator.serviceWorker.register(SW_PATH);
  await navigator.serviceWorker.ready;

  const deviceToken = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!deviceToken) throw new Error('Firebase did not issue a device token');

  await api.registerPushDevice(authToken, deviceToken);
  return 'granted';
}

export function enableWebPush(authToken: string): Promise<PushStatus> {
  return register(authToken, true);
}

/** Registers silently when the browser already allows notifications. */
export function syncWebPush(authToken: string): Promise<PushStatus> {
  return register(authToken, false);
}

export function listenForPush(
  onPush: (title: string) => void,
): Promise<() => void> {
  return getMessagingInstance().then((messaging) => {
    if (!messaging) return () => {};
    return onMessage(messaging, (payload) => {
      onPush(payload.notification?.title ?? payload.data?.title ?? 'New notification');
    });
  });
}
