// ============================================================
// Hyna Management: Native Web Push Service
// Manages Service Worker registration, VAPID key conversion,
// PushSubscription creation, and Edge Function synchronization.
// No Firebase SDK / No proprietary tokens.
// ============================================================

import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export const DEFAULT_VAPID_PUBLIC_KEY =
  'BF-KCxXr3btAZHOV-bue50RbRyP-eqacJZp6Uaw1cweYSEWTykzUCMmm7vGbPO2QpF9mF9Ieig4SStzBdB_Lh4s';

export function getVapidPublicKey(): string {
  return import.meta.env.VITE_VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;
}

// Helper: Convert Base64URL string to Uint8Array (required by PushManager)
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Helper: Convert ArrayBuffer to Base64URL
export function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function isWebPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export function getNotificationPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
}

// Register or get active Service Worker
export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isWebPushSupported()) return null;

  try {
    const existing = await navigator.serviceWorker.getRegistration('/sw.js');
    if (existing) return existing;

    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    await navigator.serviceWorker.ready;
    return registration;
  } catch (err) {
    console.error('[WebPush] Service Worker registration failed:', err);
    return null;
  }
}

// Request permission with explicit user gesture
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isWebPushSupported()) return 'denied';

  try {
    const result = await Notification.requestPermission();
    return result;
  } catch (err) {
    console.error('[WebPush] Error requesting notification permission:', err);
    return 'denied';
  }
}

// Get current device push subscription
export async function getCurrentDeviceSubscription(): Promise<PushSubscription | null> {
  if (!isWebPushSupported()) return null;

  try {
    const registration = await getServiceWorkerRegistration();
    if (!registration) return null;

    return await registration.pushManager.getSubscription();
  } catch (err) {
    console.warn('[WebPush] Error querying push subscription:', err);
    return null;
  }
}

// Subscribe device and register with Supabase
export async function subscribeDeviceToPush(
  memberId: string
): Promise<{ success: boolean; subscription?: PushSubscription; error?: string }> {
  if (!isWebPushSupported()) {
    return { success: false, error: 'Web Push is not supported in this browser' };
  }

  try {
    // 1. Ensure permission is granted
    if (Notification.permission !== 'granted') {
      const permission = await requestNotificationPermission();
      if (permission !== 'granted') {
        return {
          success: false,
          error:
            permission === 'denied'
              ? 'Notifications are blocked. Please enable notifications in your browser site settings.'
              : 'Notification permission was dismissed.',
        };
      }
    }

    // 2. Ensure Service Worker is registered
    const registration = await getServiceWorkerRegistration();
    if (!registration) {
      return { success: false, error: 'Could not initialize Service Worker for push notifications' };
    }

    // 3. Check for existing subscription or create new
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      const vapidKey = getVapidPublicKey();
      const applicationServerKey = urlBase64ToUint8Array(vapidKey);

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as unknown as BufferSource,
      });
    }

    const p256dh = arrayBufferToBase64Url(subscription.getKey('p256dh'));
    const auth = arrayBufferToBase64Url(subscription.getKey('auth'));

    if (!p256dh || !auth) {
      return { success: false, error: 'Browser failed to provide cryptographic encryption keys' };
    }

    const payload = {
      endpoint: subscription.endpoint,
      keys: { p256dh, auth },
      userAgent: navigator.userAgent,
      memberId,
    };

    // 4. Send subscription to Edge Function
    try {
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke(
        'register-push-subscription',
        { body: payload }
      );

      if (!edgeError && edgeData?.success) {
        return { success: true, subscription };
      }
    } catch {
      // Fallback: If Edge function is not deployed yet, insert directly via Supabase client
    }

    if (isSupabaseConfigured()) {
      const { error: dbError } = await supabase
        .from('push_subscriptions')
        .upsert(
          {
            member_id: memberId,
            endpoint: subscription.endpoint,
            p256dh,
            auth,
            user_agent: navigator.userAgent,
            last_seen_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'endpoint' }
        );

      if (dbError) {
        console.error('[WebPush] Database sync failed:', dbError);
      }
    }

    return { success: true, subscription };
  } catch (err: any) {
    console.error('[WebPush] Subscription error:', err);
    return { success: false, error: err?.message || 'Failed to enable browser push notifications' };
  }
}

// Unsubscribe device
export async function unsubscribeDeviceFromPush(memberId: string): Promise<boolean> {
  if (!isWebPushSupported()) return false;

  try {
    const subscription = await getCurrentDeviceSubscription();
    if (!subscription) return true;

    const endpoint = subscription.endpoint;

    // 1. Unsubscribe at browser level
    await subscription.unsubscribe();

    // 2. Remove from Edge Function
    try {
      await supabase.functions.invoke('remove-push-subscription', {
        body: { endpoint, memberId },
      });
    } catch {
      // Fallback to direct DB delete
    }

    if (isSupabaseConfigured()) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('member_id', memberId)
        .eq('endpoint', endpoint);
    }

    return true;
  } catch (err) {
    console.error('[WebPush] Unsubscribe error:', err);
    return false;
  }
}

// Send a test Web Push notification to current member
export async function sendTestPushNotification(memberId: string): Promise<{ success: boolean; message: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('send-notification', {
      body: {
        title: 'Hyna Studio Test Notification',
        message: 'Native Web Push is active and verified on this device!',
        type: 'general',
        actionUrl: '/settings',
        callerId: memberId,
        recipients: {
          type: 'users',
          userIds: [memberId],
        },
      },
    });

    if (error) {
      // Fallback to local in-app notification if Edge Function is offline
      await supabase.from('notifications').insert({
        user_id: memberId,
        title: 'Hyna Studio Test Notification',
        message: 'In-app notification system is active and verified!',
        type: 'general',
        link: '/settings',
        is_read: false,
      });

      return {
        success: true,
        message: 'Test notification recorded in your Notification Center!',
      };
    }

    return {
      success: true,
      message: data?.message || 'Test push notification sent to your device!',
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Could not send test notification',
    };
  }
}

export interface NotificationPreferences {
  member_id?: string;
  push_enabled: boolean;
  tasks_enabled: boolean;
  projects_enabled: boolean;
  modules_enabled: boolean;
  meetings_enabled: boolean;
  attendance_enabled: boolean;
  announcements_enabled: boolean;
  events_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

export async function getNotificationPreferences(memberId: string): Promise<NotificationPreferences> {
  const defaultPrefs: NotificationPreferences = {
    push_enabled: true,
    tasks_enabled: true,
    projects_enabled: true,
    modules_enabled: true,
    meetings_enabled: true,
    attendance_enabled: true,
    announcements_enabled: true,
    events_enabled: true,
    quiet_hours_enabled: false,
    quiet_hours_start: '22:00:00',
    quiet_hours_end: '08:00:00',
  };

  if (!isSupabaseConfigured() || !memberId) return defaultPrefs;

  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('member_id', memberId)
      .maybeSingle();

    if (error || !data) return defaultPrefs;
    return {
      push_enabled: data.push_enabled ?? true,
      tasks_enabled: data.tasks_enabled ?? true,
      projects_enabled: data.projects_enabled ?? true,
      modules_enabled: data.modules_enabled ?? true,
      meetings_enabled: data.meetings_enabled ?? true,
      attendance_enabled: data.attendance_enabled ?? true,
      announcements_enabled: data.announcements_enabled ?? true,
      events_enabled: data.events_enabled ?? true,
      quiet_hours_enabled: data.quiet_hours_enabled ?? false,
      quiet_hours_start: data.quiet_hours_start ?? '22:00:00',
      quiet_hours_end: data.quiet_hours_end ?? '08:00:00',
    };
  } catch (err) {
    console.warn('[WebPush] Error fetching preferences:', err);
    return defaultPrefs;
  }
}

export async function updateNotificationPreferences(
  memberId: string,
  prefs: Partial<NotificationPreferences>
): Promise<boolean> {
  if (!isSupabaseConfigured() || !memberId) return false;

  try {
    const payload = {
      member_id: memberId,
      ...prefs,
      push_enabled: true,
      tasks_enabled: true,
      projects_enabled: true,
      modules_enabled: true,
      meetings_enabled: true,
      attendance_enabled: true,
      announcements_enabled: true,
      events_enabled: true,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('notification_preferences')
      .upsert(payload, { onConflict: 'member_id' });

    if (error) {
      console.error('[WebPush] Error updating preferences:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[WebPush] Exception updating preferences:', err);
    return false;
  }
}
