export {};

// Renderer logic for Hyna Desktop Tracker
declare global {
  interface Window {
    trackerAPI: {
      getStatus: () => Promise<any>;
      startTracking: () => Promise<any>;
      pauseTracking: () => Promise<any>;
      setIdleThreshold: (minutes: number) => Promise<any>;
      forceSync: () => Promise<{ success: boolean; syncedCount: number; remaining: number }>;
      login: (email: string, password: string) => Promise<{ success: boolean; user?: any; error?: string }>;
      logout: () => Promise<void>;
      onStatusUpdate: (callback: (status: any) => void) => () => void;
      openExternal: (url: string) => void;
    };
  }
}

function formatDurationClock(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds < 0) return '00h 00m 00s';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
}

function getAppColor(appName: string): string {
  const lower = (appName || '').toLowerCase();
  if (lower.includes('code') || lower.includes('vs code')) return '#007ACC';
  if (lower.includes('cursor')) return '#8B5CF6';
  if (lower.includes('antigravity')) return '#06B6D4';
  return '#71717A';
}

document.addEventListener('DOMContentLoaded', async () => {
  const loginView = document.getElementById('loginView')!;
  const trackerView = document.getElementById('trackerView')!;
  const logoutBtn = document.getElementById('logoutBtn')!;
  const loginForm = document.getElementById('loginForm') as HTMLFormElement;
  const loginError = document.getElementById('loginError')!;
  const submitLoginBtn = document.getElementById('submitLoginBtn') as HTMLButtonElement;

  const userAvatar = document.getElementById('userAvatar')!;
  const userName = document.getElementById('userName')!;
  const userRole = document.getElementById('userRole')!;
  const trackingIndicator = document.getElementById('trackingIndicator')!;

  const appDot = document.getElementById('appDot')!;
  const currentAppName = document.getElementById('currentAppName')!;
  const currentWorkspace = document.getElementById('currentWorkspace')!;
  const appStateBadge = document.getElementById('appStateBadge')!;

  const activeTimeToday = document.getElementById('activeTimeToday')!;
  const idleTimeToday = document.getElementById('idleTimeToday')!;

  const toggleTrackingBtn = document.getElementById('toggleTrackingBtn') as HTMLButtonElement;
  const syncNowBtn = document.getElementById('syncNowBtn') as HTMLButtonElement;
  const idleThresholdSelect = document.getElementById('idleThresholdSelect') as HTMLSelectElement;

  const queueStatus = document.getElementById('queueStatus')!;
  const lastSyncStatus = document.getElementById('lastSyncStatus')!;
  const openDashboardLink = document.getElementById('openDashboardLink')!;
  const openPrivacyLink = document.getElementById('openPrivacyLink')!;

  let currentStatus: any = null;

  function renderStatus(status: any) {
    currentStatus = status;

    if (!status.user) {
      loginView.style.display = 'block';
      trackerView.style.display = 'none';
      logoutBtn.style.display = 'none';
      return;
    }

    loginView.style.display = 'none';
    trackerView.style.display = 'flex';
    trackerView.style.flexDirection = 'column';
    trackerView.style.gap = '12px';
    logoutBtn.style.display = 'flex';

    // User details
    userName.textContent = status.user.name || 'Team Member';
    userRole.textContent = `${status.user.designation || 'Software Engineer'} (${status.user.role || 'member'})`;
    userAvatar.textContent = (status.user.name || 'U').charAt(0).toUpperCase();

    // Tracking state
    if (status.isTracking) {
      trackingIndicator.innerHTML = '<span class="pulse-dot"></span> Tracking Active';
      trackingIndicator.style.color = '#10b981';
      toggleTrackingBtn.textContent = 'Pause Tracking';
      toggleTrackingBtn.className = 'btn btn-secondary';
    } else {
      trackingIndicator.innerHTML = '<span class="dot" style="background:#ef4444"></span> Tracking Paused';
      trackingIndicator.style.color = '#ef4444';
      toggleTrackingBtn.textContent = 'Resume Tracking';
      toggleTrackingBtn.className = 'btn btn-primary';
    }

    // Foreground IDE
    const isSupported = status.currentApp && status.currentApp !== 'Unknown';
    if (isSupported) {
      currentAppName.textContent = status.currentApp;
      appDot.style.backgroundColor = getAppColor(status.currentApp);
      appDot.style.boxShadow = `0 0 10px ${getAppColor(status.currentApp)}`;

      if (status.projectName) {
        currentWorkspace.textContent = `Project: ${status.projectName}`;
        currentWorkspace.style.display = 'block';
      } else {
        currentWorkspace.textContent = 'Active in workspace';
        currentWorkspace.style.display = 'block';
      }

      if (status.isIdle) {
        appStateBadge.textContent = 'Idle (Away)';
        appStateBadge.className = 'badge badge-idle';
      } else {
        appStateBadge.textContent = 'Coding (Active)';
        appStateBadge.className = 'badge badge-active';
      }
    } else {
      currentAppName.textContent = 'Waiting for IDE...';
      currentWorkspace.textContent = 'Open VS Code, Cursor, or Antigravity';
      appDot.style.backgroundColor = '#71717A';
      appDot.style.boxShadow = 'none';
      appStateBadge.textContent = 'Standby';
      appStateBadge.className = 'badge';
      appStateBadge.style.background = '#27272a';
      appStateBadge.style.color = '#a1a1aa';
    }

    // Counters
    activeTimeToday.textContent = formatDurationClock(status.activeSecondsToday);
    idleTimeToday.textContent = formatDurationClock(status.idleSecondsToday);

    // Queue & Sync info
    queueStatus.textContent = `Queue: ${status.offlineQueueCount} offline session${status.offlineQueueCount === 1 ? '' : 's'}`;
    if (status.lastSyncTime) {
      const d = new Date(status.lastSyncTime);
      lastSyncStatus.textContent = `Synced: ${d.toLocaleTimeString()}`;
    } else {
      lastSyncStatus.textContent = 'Synced: Waiting for batch';
    }

    // Idle threshold selection
    if (status.idleThresholdMinutes) {
      idleThresholdSelect.value = String(status.idleThresholdMinutes);
    }
  }

  // Initial status load
  try {
    const initialStatus = await window.trackerAPI.getStatus();
    renderStatus(initialStatus);
  } catch (err) {
    console.error('Error fetching initial status:', err);
  }

  // Subscribe to live status updates pushed from main process
  window.trackerAPI.onStatusUpdate((status: any) => {
    renderStatus(status);
  });

  // Login form submission
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (document.getElementById('emailInput') as HTMLInputElement).value;
    const password = (document.getElementById('passwordInput') as HTMLInputElement).value;

    loginError.style.display = 'none';
    submitLoginBtn.disabled = true;
    submitLoginBtn.textContent = 'Signing in...';

    try {
      const res = await window.trackerAPI.login(email, password);
      if (!res.success) {
        loginError.textContent = res.error || 'Authentication failed. Please check credentials.';
        loginError.style.display = 'block';
      } else {
        const status = await window.trackerAPI.getStatus();
        renderStatus(status);
      }
    } catch (err: any) {
      loginError.textContent = err?.message || 'Login error occurred';
      loginError.style.display = 'block';
    } finally {
      submitLoginBtn.disabled = false;
      submitLoginBtn.textContent = 'Sign In & Start Tracking';
    }
  });

  // Logout
  logoutBtn.addEventListener('click', async () => {
    if (confirm('Log out from Hyna Desktop Tracker?')) {
      await window.trackerAPI.logout();
      const status = await window.trackerAPI.getStatus();
      renderStatus(status);
    }
  });

  // Toggle tracking
  toggleTrackingBtn.addEventListener('click', async () => {
    if (currentStatus?.isTracking) {
      const newStatus = await window.trackerAPI.pauseTracking();
      renderStatus(newStatus);
    } else {
      const newStatus = await window.trackerAPI.startTracking();
      renderStatus(newStatus);
    }
  });

  // Idle threshold change
  idleThresholdSelect.addEventListener('change', async (e) => {
    const minutes = parseInt((e.target as HTMLSelectElement).value, 10);
    const newStatus = await window.trackerAPI.setIdleThreshold(minutes);
    renderStatus(newStatus);
  });

  // Force sync
  syncNowBtn.addEventListener('click', async () => {
    syncNowBtn.disabled = true;
    syncNowBtn.textContent = 'Syncing...';
    try {
      const res = await window.trackerAPI.forceSync();
      syncNowBtn.textContent = `Synced (${res.syncedCount})`;
      setTimeout(() => {
        syncNowBtn.textContent = 'Sync Now';
        syncNowBtn.disabled = false;
      }, 1500);
      const status = await window.trackerAPI.getStatus();
      renderStatus(status);
    } catch (e) {
      syncNowBtn.textContent = 'Sync Failed';
      setTimeout(() => {
        syncNowBtn.textContent = 'Sync Now';
        syncNowBtn.disabled = false;
      }, 1500);
    }
  });

  // External links
  openDashboardLink.addEventListener('click', (e) => {
    e.preventDefault();
    window.trackerAPI.openExternal('http://localhost:5173');
  });

  openPrivacyLink.addEventListener('click', (e) => {
    e.preventDefault();
    window.trackerAPI.openExternal('http://localhost:5173/privacy/tracking');
  });
});
