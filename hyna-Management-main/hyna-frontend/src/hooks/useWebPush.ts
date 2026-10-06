// ============================================================
// Hyna Management: useWebPush Hook
// Reactive React hook for device push subscription state,
// permissions, and user action triggers
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores';
import {
  isWebPushSupported,
  getNotificationPermission,
  getCurrentDeviceSubscription,
  subscribeDeviceToPush,
  unsubscribeDeviceFromPush,
  sendTestPushNotification,
} from '@/services/pushNotificationService';

export function useWebPush() {
  const { currentUser, isAuthenticated } = useAuthStore();
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Sync current device subscription state
  const syncStatus = useCallback(async () => {
    const supported = isWebPushSupported();
    setIsSupported(supported);

    if (!supported) {
      setIsLoading(false);
      return;
    }

    const currentPerm = getNotificationPermission();
    setPermission(currentPerm);

    if (currentPerm === 'granted') {
      const sub = await getCurrentDeviceSubscription();
      setIsSubscribed(Boolean(sub));
    } else {
      setIsSubscribed(false);
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    syncStatus();
  }, [syncStatus, isAuthenticated, currentUser?.id]);

  // Enable push notifications
  const enablePush = async (): Promise<boolean> => {
    if (!currentUser?.id) {
      toast.error('You must be signed in to enable push notifications');
      return false;
    }

    setIsLoading(true);
    const toastId = toast.loading('Enabling browser push notifications...');

    try {
      const result = await subscribeDeviceToPush(currentUser.id);

      if (result.success) {
        setIsSubscribed(true);
        setPermission('granted');
        toast.success('Push notifications successfully enabled on this device!', { id: toastId });
        return true;
      } else {
        toast.error(result.error || 'Failed to enable notifications', { id: toastId });
        setPermission(getNotificationPermission());
        return false;
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error subscribing to notifications', { id: toastId });
      return false;
    } finally {
      setIsLoading(false);
      syncStatus();
    }
  };

  // Disable push notifications
  const disablePush = async (): Promise<boolean> => {
    if (!currentUser?.id) return false;

    setIsLoading(true);
    const toastId = toast.loading('Disabling push notifications...');

    try {
      const success = await unsubscribeDeviceFromPush(currentUser.id);
      if (success) {
        setIsSubscribed(false);
        toast.success('Notifications disabled for this device', { id: toastId });
      } else {
        toast.error('Could not disable push notifications', { id: toastId });
      }
      return success;
    } finally {
      setIsLoading(false);
      syncStatus();
    }
  };

  // Trigger test push
  const sendTest = async () => {
    if (!currentUser?.id) return;
    const toastId = toast.loading('Sending test notification...');
    const result = await sendTestPushNotification(currentUser.id);

    if (result.success) {
      toast.success(result.message, { id: toastId });
    } else {
      toast.error(result.message, { id: toastId });
    }
  };

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    enablePush,
    disablePush,
    sendTest,
    refreshStatus: syncStatus,
  };
}
