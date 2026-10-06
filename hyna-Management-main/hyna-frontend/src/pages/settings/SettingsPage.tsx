import React, { useState, useRef, useEffect } from 'react';
import {
  User,
  Sun,
  Moon,
  Monitor,
  Shield,
  Bell,
  BellOff,
  Building,
  Key,
  Save,
  CheckCircle2,
  Lock,
  Smartphone,
  Globe,
  Palette,
  Camera,
  Upload,
  Trash2,
  Image,
  Sparkles,
  Loader2,
  Link as LinkIcon,
  Send,
  AlertCircle,
  Clock,
  ShieldAlert,
  Landmark,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, Avatar } from '@/components/ui';
import { useAuthStore, useThemeStore } from '@/stores';
import { updateUserProfile, uploadAvatar } from '@/services/api';
import { useWebPush } from '@/hooks/useWebPush';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from '@/services/pushNotificationService';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200&auto=format&fit=crop&q=80',
];

export function SettingsPage() {
  const { currentUser, currentRole, setUser, activeOrganization } = useAuthStore();
  const { mode, setMode } = useThemeStore();

  const [activeTab, setActiveTab] = useState<'profile' | 'appearance' | 'notifications' | 'security'>('profile');

  // Profile form state
  const [name, setName] = useState(currentUser?.name || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [designation, setDesignation] = useState(currentUser?.designation || '');
  const [department, setDepartment] = useState(currentUser?.department || '');
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [avatar, setAvatar] = useState(currentUser?.avatar || '');
  const [bankAccountNumber, setBankAccountNumber] = useState(currentUser?.bankAccountNumber || '');
  const [ifsc, setIfsc] = useState(currentUser?.ifsc || '');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Native Web Push Hook
  const {
    isSupported: isPushSupported,
    permission: pushPermission,
    isSubscribed: isDeviceSubscribed,
    isLoading: isPushLoading,
    enablePush,
    disablePush,
    sendTest: sendTestPush,
  } = useWebPush();

  // Notification Preferences State (Synchronized with Supabase)
  const [preferences, setPreferences] = useState<NotificationPreferences>({
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
  });
  const [isLoadingPrefs, setIsLoadingPrefs] = useState(false);

  useEffect(() => {
    if (currentUser?.id) {
      setIsLoadingPrefs(true);
      getNotificationPreferences(currentUser.id)
        .then((p) => setPreferences(p))
        .finally(() => setIsLoadingPrefs(false));
    }
  }, [currentUser?.id]);

  const handleTogglePreference = async (key: keyof NotificationPreferences, value: any) => {
    if (!currentUser?.id) return;
    const updated = { ...preferences, [key]: value };
    setPreferences(updated);
    try {
      await updateNotificationPreferences(currentUser.id, { [key]: value });
      toast.success('Notification preference saved');
    } catch {
      toast.error('Failed to update preference');
    }
  };

  // Security state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setNewConfirmPassword] = useState('');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || '');
      setEmail(currentUser.email || '');
      setPhone(currentUser.phone || '');
      setDesignation(currentUser.designation || '');
      setDepartment(currentUser.department || '');
      setBio(currentUser.bio || '');
      setAvatar(currentUser.avatar || '');
      setBankAccountNumber(currentUser.bankAccountNumber || '');
      setIfsc(currentUser.ifsc || '');
    }
  }, [currentUser]);

  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser?.id) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (PNG, JPG, WebP, etc.).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image file must be under 5MB.');
      return;
    }

    setIsUploadingAvatar(true);
    const toastId = toast.loading('Uploading profile picture...');

    try {
      const publicUrl = await uploadAvatar(currentUser.id, file);
      setAvatar(publicUrl);
      const updated = await updateUserProfile(currentUser.id, { avatar: publicUrl });
      setUser(updated);
      toast.success('Profile picture updated successfully!', { id: toastId });
    } catch (err: any) {
      console.error('Avatar upload error:', err);
      toast.error(err?.message || 'Failed to upload profile picture', { id: toastId });
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    if (!currentUser?.id) return;
    setIsUploadingAvatar(true);
    try {
      setAvatar('');
      const updated = await updateUserProfile(currentUser.id, { avatar: '' });
      setUser(updated);
      toast.success('Profile picture removed. Reverted to initials.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove avatar');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSelectPresetAvatar = async (presetUrl: string) => {
    if (!currentUser?.id) return;
    setIsUploadingAvatar(true);
    try {
      setAvatar(presetUrl);
      const updated = await updateUserProfile(currentUser.id, { avatar: presetUrl });
      setUser(updated);
      toast.success('Profile picture updated!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to apply preset');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleApplyCustomUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customAvatarUrl.trim() || !currentUser?.id) return;
    setIsUploadingAvatar(true);
    try {
      const url = customAvatarUrl.trim();
      setAvatar(url);
      const updated = await updateUserProfile(currentUser.id, { avatar: url });
      setUser(updated);
      setShowUrlInput(false);
      setCustomAvatarUrl('');
      toast.success('Custom avatar URL applied!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update avatar URL');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.id) return;

    try {
      const updated = await updateUserProfile(currentUser.id, {
        name,
        phone,
        bio,
        designation,
        department,
        avatar,
        bankAccountNumber: bankAccountNumber.trim(),
        ifsc: ifsc.trim().toUpperCase(),
      });
      setUser(updated);
      toast.success('Profile updated successfully!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update profile');
    }
  };

  const handleSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword && newPassword !== confirmPassword) {
      toast.error('New passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Security settings updated in Supabase Auth!');
      setCurrentPassword('');
      setNewPassword('');
      setNewConfirmPassword('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update password');
    }
  };

  return (
    <div className="page-container space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Manage your account preferences, appearance, notifications, and security.
        </p>
      </div>

      {/* Tabs navigation */}
      <div className="flex border-b border-[var(--color-border)] overflow-x-auto gap-4">
        {[
          { id: 'profile', label: 'Profile', icon: User },
          { id: 'appearance', label: 'Appearance', icon: Palette },
          { id: 'notifications', label: 'Notifications', icon: Bell },
          { id: 'security', label: 'Security & Access', icon: Shield },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                'flex items-center gap-2 py-3 px-3 border-b-2 text-sm font-medium transition cursor-pointer shrink-0',
                isActive
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          <div className="card p-6 border border-[var(--color-border)] bg-[var(--color-card)] rounded-xl space-y-6">
            {/* Avatar & Photo Customization Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-5">
                <div className="relative group">
                  <Avatar name={currentUser?.name || 'User'} src={avatar} size="xl" className="ring-4 ring-[var(--color-primary)]/20 shadow-md" />
                  
                  {/* Quick Change Badge Button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingAvatar}
                    className="absolute -bottom-1 -right-1 p-2 rounded-full bg-[var(--color-primary)] text-white shadow-lg hover:scale-110 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                    title="Upload new profile picture"
                  >
                    {isUploadingAvatar ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Camera className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleAvatarFileSelect}
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    className="hidden"
                  />
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-lg text-[var(--color-foreground)]">{currentUser?.name}</h3>
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                      {currentRole}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                    {currentUser?.designation || 'Team Member'} • {currentUser?.department || activeOrganization}
                  </p>
                  <p className="text-[11px] text-[var(--color-muted-foreground)]/80 mt-1">
                    PNG, JPG, WebP up to 5MB. Real-time synchronized across all pages.
                  </p>
                </div>
              </div>

              {/* Action Buttons for Avatar */}
              <div className="flex items-center gap-2 flex-wrap sm:self-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  className="cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  Upload Photo
                </Button>
                
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowUrlInput(!showUrlInput)}
                  className="cursor-pointer text-xs"
                >
                  <LinkIcon className="w-3.5 h-3.5 mr-1" />
                  Image URL
                </Button>

                {avatar && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveAvatar}
                    disabled={isUploadingAvatar}
                    className="text-red-500 hover:text-red-600 hover:bg-red-500/10 cursor-pointer text-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Remove
                  </Button>
                )}
              </div>
            </div>

            {/* Custom URL Input Accordion */}
            {showUrlInput && (
              <form onSubmit={handleApplyCustomUrl} className="p-3 rounded-xl bg-[var(--color-muted)]/50 border border-[var(--color-border)] flex items-center gap-2 animate-slide-up">
                <input
                  type="url"
                  placeholder="https://example.com/my-photo.jpg"
                  value={customAvatarUrl}
                  onChange={(e) => setCustomAvatarUrl(e.target.value)}
                  className="flex-1 h-8 px-3 rounded-lg border border-[var(--color-input)] bg-[var(--color-background)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
                  required
                />
                <Button type="submit" size="sm" disabled={isUploadingAvatar || !customAvatarUrl.trim()} className="h-8 text-xs">
                  Apply URL
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowUrlInput(false)} className="h-8 text-xs">
                  Cancel
                </Button>
              </form>
            )}

            {/* Preset Avatars Selection Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--color-foreground)] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Or choose a preset avatar
                </span>
                <span className="text-[11px] text-[var(--color-muted-foreground)]">Click to apply instantly</span>
              </div>
              <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
                {PRESET_AVATARS.map((preset, index) => {
                  const isSelected = avatar === preset;
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleSelectPresetAvatar(preset)}
                      disabled={isUploadingAvatar}
                      className={cn(
                        'relative rounded-full p-0.5 transition-all shrink-0 cursor-pointer hover:scale-110 active:scale-95',
                        isSelected
                          ? 'ring-2 ring-[var(--color-primary)] ring-offset-2 ring-offset-[var(--color-card)]'
                          : 'hover:ring-2 hover:ring-[var(--color-border)]'
                      )}
                      title={`Select Preset Avatar ${index + 1}`}
                    >
                      <img
                        src={preset}
                        alt={`Preset ${index + 1}`}
                        className="w-10 h-10 rounded-full object-cover shadow-xs"
                      />
                      {isSelected && (
                        <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center text-[8px] font-bold">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4 pt-4 border-t border-[var(--color-border)]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1 text-[var(--color-foreground)]">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1 text-[var(--color-foreground)]">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1 text-[var(--color-foreground)]">
                    Designation
                  </label>
                  <input
                    type="text"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1 text-[var(--color-foreground)]">
                    Department
                  </label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1 text-[var(--color-foreground)]">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 text-[var(--color-foreground)]">
                  Bio / Responsibilities
                </label>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] resize-none"
                />
              </div>

              {/* Banking & Payout Details */}
              <div className="pt-4 border-t border-[var(--color-border)]">
                <div className="flex items-center gap-2 mb-3">
                  <Landmark className="w-4 h-4 text-[var(--color-primary)]" />
                  <h4 className="text-xs font-semibold text-[var(--color-foreground)] uppercase tracking-wider">
                    Banking & Payout Details
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium mb-1 text-[var(--color-foreground)]">
                      Bank Account Number
                    </label>
                    <input
                      type="text"
                      value={bankAccountNumber}
                      onChange={(e) => setBankAccountNumber(e.target.value)}
                      placeholder="e.g. 123456789012"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] font-mono"
                    />
                    <p className="text-[11px] text-[var(--color-muted-foreground)] mt-1">
                      Account number for direct deposit and salary payouts.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1 text-[var(--color-foreground)]">
                      IFSC Code
                    </label>
                    <input
                      type="text"
                      value={ifsc}
                      onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                      placeholder="e.g. HDFC0001234"
                      maxLength={11}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] font-mono uppercase"
                    />
                    <p className="text-[11px] text-[var(--color-muted-foreground)] mt-1">
                      11-character Indian Financial System Code.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" className="gap-2 cursor-pointer">
                  <Save className="w-4 h-4" />
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Appearance Tab */}
      {activeTab === 'appearance' && (
        <div className="card p-6 border border-[var(--color-border)] bg-[var(--color-card)] rounded-xl space-y-6">
          <div>
            <h3 className="font-semibold text-base mb-1">Theme Preferences</h3>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Choose your preferred interface theme for {activeOrganization}.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { id: 'light', label: 'Light Mode', desc: 'Clean, bright workspace', icon: Sun },
              { id: 'dark', label: 'Dark Mode', desc: 'Sleek, low-glare dark palette', icon: Moon },
              { id: 'system', label: 'System Default', desc: 'Match your OS setting', icon: Monitor },
            ].map((themeOpt) => {
              const Icon = themeOpt.icon;
              const isSelected = mode === themeOpt.id;
              return (
                <button
                  key={themeOpt.id}
                  onClick={() => {
                    setMode(themeOpt.id as any);
                    toast.success(`Theme switched to ${themeOpt.label}`);
                  }}
                  className={cn(
                    'p-4 rounded-xl border text-left transition cursor-pointer',
                    isSelected
                      ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20 bg-[var(--color-muted)]'
                      : 'border-[var(--color-border)] hover:border-zinc-400 bg-[var(--color-card)]'
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Icon className="w-5 h-5 text-[var(--color-primary)]" />
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-[var(--color-primary)]" />}
                  </div>
                  <p className="font-semibold text-sm">{themeOpt.label}</p>
                  <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">{themeOpt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div className="space-y-6">
          {/* 1. Device Push Notification Status & Controls Card */}
          <div className="card p-6 border border-[var(--color-border)] bg-[var(--color-card)] rounded-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--color-border)]">
              <div>
                <div className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-[var(--color-primary)]" />
                  <h3 className="font-bold text-base text-[var(--color-foreground)]">Browser Push Notifications</h3>
                </div>
                <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
                  Hardware-level native push notifications delivered directly to this browser using W3C Push API and VAPID.
                </p>
              </div>

              {/* Status Badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1.5',
                  !isPushSupported
                    ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                    : isDeviceSubscribed
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                    : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/20'
                )}>
                  <span className={cn('w-2 h-2 rounded-full', isDeviceSubscribed ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400')} />
                  {isDeviceSubscribed ? 'Subscribed & Active' : isPushSupported ? 'Ready to Enable' : 'Unsupported Browser'}
                </span>
                
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--color-muted)] text-[var(--color-muted-foreground)] border border-[var(--color-border)]">
                  Permission: <strong className="capitalize text-[var(--color-foreground)]">{pushPermission}</strong>
                </span>
              </div>
            </div>

            {/* Browser Permission Denied Warning */}
            {pushPermission === 'denied' && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-amber-800 dark:text-amber-200">
                    Notifications are blocked in your browser settings
                  </p>
                  <p className="text-amber-700 dark:text-amber-300/90 leading-relaxed">
                    To receive updates for task assignments, meeting alerts, and announcements:
                    click the <strong>Lock / Settings</strong> icon in your browser's address bar next to the URL, change <strong>Notifications</strong> to <strong>Allow</strong>, and reload the page.
                  </p>
                </div>
              </div>
            )}

            {/* Device Actions */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-1">
              <div className="text-xs text-[var(--color-muted-foreground)]">
                {isDeviceSubscribed ? (
                  <span>This browser is registered to receive encrypted background alerts even when the tab is closed.</span>
                ) : (
                  <span>Enable push to get notified instantly when tasks are assigned, meetings start, or announcements arrive.</span>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {!isDeviceSubscribed ? (
                  <Button
                    type="button"
                    onClick={enablePush}
                    disabled={isPushLoading || !isPushSupported || pushPermission === 'denied'}
                    className="gap-2 cursor-pointer text-xs"
                  >
                    {isPushLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                    Enable Push on This Device
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={sendTestPush}
                      disabled={isPushLoading}
                      className="gap-1.5 cursor-pointer text-xs"
                    >
                      <Send className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                      Send Test Push
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={disablePush}
                      disabled={isPushLoading}
                      className="gap-1.5 cursor-pointer text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10"
                    >
                      <BellOff className="w-3.5 h-3.5" />
                      Unsubscribe Device
                    </Button>
                  </>
                )}
              </div>
            </div>
            
            <p className="text-[11px] text-[var(--color-muted-foreground)]/80 italic border-t border-[var(--color-border)] pt-3">
              Note: Unsubscribing this device only removes this specific browser. Your other registered phones or laptops remain active.
            </p>
          </div>

          {/* 2. Notification Preferences by Category */}
          <div className="card p-6 border border-[var(--color-border)] bg-[var(--color-card)] rounded-xl space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border)]">
              <div>
                <h3 className="font-bold text-base text-[var(--color-foreground)]">Notification Preferences</h3>
                <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                  Customize which notifications and reminders are delivered across your devices.
                </p>
              </div>

              {/* Master Push Toggle */}
              <div className="flex items-center gap-3 bg-[var(--color-muted)] px-3 py-1.5 rounded-lg border border-[var(--color-border)]">
                <span className="text-xs font-semibold text-[var(--color-foreground)]">Global Push</span>
                <input
                  type="checkbox"
                  checked={preferences.push_enabled}
                  disabled={isLoadingPrefs}
                  onChange={(e) => handleTogglePreference('push_enabled', e.target.checked)}
                  className="w-4 h-4 rounded text-[var(--color-primary)] focus:ring-[var(--color-primary)] cursor-pointer"
                  title="Enable or disable all push notifications"
                />
              </div>
            </div>

            <div className="space-y-4">
              {[
                {
                  key: 'tasks_enabled',
                  label: 'Task Assignments & Status',
                  desc: 'Alerts when assigned new tasks, deadline approaching, or task review completed',
                  checked: preferences.tasks_enabled,
                },
                {
                  key: 'projects_enabled',
                  label: 'Project Updates & Milestones',
                  desc: 'Notifies when added to a project, project status changes, or milestone reached',
                  checked: preferences.projects_enabled,
                },
                {
                  key: 'modules_enabled',
                  label: 'Module Deliverables & Reviews',
                  desc: 'Notifications when modules are assigned, submitted, or sent back for revision',
                  checked: preferences.modules_enabled,
                },
                {
                  key: 'meetings_enabled',
                  label: 'Meeting Invitations & Reminders',
                  desc: 'Upcoming standup alerts 10 minutes prior, room updates, and calendar invites',
                  checked: preferences.meetings_enabled,
                },
                {
                  key: 'attendance_enabled',
                  label: 'Attendance & Check-in Reminders',
                  desc: 'Daily check-in reminder at start of shift and clock-out verification',
                  checked: preferences.attendance_enabled,
                },
                {
                  key: 'announcements_enabled',
                  label: 'Studio Announcements & Broadcasts',
                  desc: 'Official company bulletins and urgent management notifications',
                  checked: preferences.announcements_enabled,
                },
                {
                  key: 'events_enabled',
                  label: 'Weekly Bash & Studio Events',
                  desc: 'Weekly Bash schedules, hackathons, and company-wide events',
                  checked: preferences.events_enabled,
                },
              ].map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between py-3 border-b border-[var(--color-border)] last:border-0"
                >
                  <div className="pr-4">
                    <p className="text-sm font-medium text-[var(--color-foreground)]">{item.label}</p>
                    <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">{item.desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={true}
                    disabled={true}
                    className="w-4 h-4 rounded text-[var(--color-primary)] focus:ring-[var(--color-primary)] cursor-not-allowed opacity-60"
                    title="Mandatory for all members"
                  />
                </div>
              ))}

              {/* Mandatory Security Notice Row */}
              <div className="flex items-center justify-between py-3 bg-[var(--color-muted)]/40 px-4 rounded-xl border border-[var(--color-border)]">
                <div>
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-emerald-500" />
                    <p className="text-sm font-semibold text-[var(--color-foreground)]">System & Security Notices</p>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      Mandatory
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                    Critical account alerts, security warnings, and role updates cannot be disabled.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={true}
                  disabled={true}
                  className="w-4 h-4 rounded text-zinc-400 cursor-not-allowed opacity-60"
                />
              </div>
            </div>
          </div>

          {/* 3. Quiet Hours (Do Not Disturb) Card */}
          <div className="card p-6 border border-[var(--color-border)] bg-[var(--color-card)] rounded-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--color-border)]">
              <div>
                <div className="flex items-center gap-2">
                  <Moon className="w-5 h-5 text-indigo-500" />
                  <h3 className="font-bold text-base text-[var(--color-foreground)]">Quiet Hours (Do Not Disturb)</h3>
                </div>
                <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
                  Mute routine task and meeting alerts during off-work hours or while resting.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-[var(--color-foreground)]">Enable</span>
                <input
                  type="checkbox"
                  checked={preferences.quiet_hours_enabled}
                  onChange={(e) => handleTogglePreference('quiet_hours_enabled', e.target.checked)}
                  className="w-4 h-4 rounded text-[var(--color-primary)] focus:ring-[var(--color-primary)] cursor-pointer"
                />
              </div>
            </div>

            {preferences.quiet_hours_enabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-slide-up">
                <div>
                  <label className="block text-xs font-medium mb-1.5 text-[var(--color-foreground)]">
                    Quiet Hours Start Time
                  </label>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[var(--color-muted-foreground)]" />
                    <input
                      type="time"
                      value={preferences.quiet_hours_start?.slice(0, 5) || '22:00'}
                      onChange={(e) => handleTogglePreference('quiet_hours_start', e.target.value + ':00')}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1.5 text-[var(--color-foreground)]">
                    Quiet Hours End Time
                  </label>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[var(--color-muted-foreground)]" />
                    <input
                      type="time"
                      value={preferences.quiet_hours_end?.slice(0, 5) || '08:00'}
                      onChange={(e) => handleTogglePreference('quiet_hours_end', e.target.value + ':00')}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
                    />
                  </div>
                </div>
              </div>
            )}

            <p className="text-xs text-[var(--color-muted-foreground)]">
              During quiet hours, routine notifications will still be safely logged in your in-app notification center, but device popups and vibration will be suppressed.
            </p>
          </div>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="card p-6 border border-[var(--color-border)] bg-[var(--color-card)] rounded-xl space-y-6">
          <div>
            <h3 className="font-semibold text-base mb-1">Security & Authentication</h3>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Update password credentials and two-factor authentication.
            </p>
          </div>

          <form onSubmit={handleSaveSecurity} className="space-y-4 max-w-md">
            <div>
              <label className="block text-xs font-medium mb-1 text-[var(--color-foreground)]">
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1 text-[var(--color-foreground)]">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1 text-[var(--color-foreground)]">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setNewConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
              />
            </div>

            <div className="pt-2">
              <Button type="submit" className="gap-2 cursor-pointer">
                <Lock className="w-4 h-4" />
                Update Password
              </Button>
            </div>
          </form>

          <div className="pt-4 border-t border-[var(--color-border)] flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Two-Factor Authentication (2FA)</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Add an extra layer of security requiring authenticator app OTP.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTwoFactorEnabled(!twoFactorEnabled);
                toast.success(twoFactorEnabled ? '2FA disabled' : '2FA activated');
              }}
            >
              {twoFactorEnabled ? 'Enabled' : 'Enable 2FA'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
