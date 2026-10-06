import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, UserRole } from '../types';

import { supabase, isSupabaseConfigured } from '@/lib/supabase';

// Helper: Determine effective role strictly based on database role
export function computeEffectiveRole(user: { role?: string; designation?: string; name?: string; email?: string; employeeId?: string } | null | undefined): 'admin' | 'manager' | 'member' {
  if (!user) return 'member';
  const roleLower = (user.role || '').trim().toLowerCase();
  
  if (roleLower === 'admin') return 'admin';
  if (roleLower === 'manager') return 'manager';
  
  return 'member';
}

export function isCeoOrCto(user: { role?: string; designation?: string; name?: string; email?: string; employeeId?: string } | null | undefined): boolean {
  if (!user) return false;
  const roleLower = (user.role || '').trim().toLowerCase();
  return roleLower === 'admin';
}

export function isExecutiveLeadership(user: { role?: string; designation?: string; name?: string; email?: string; employeeId?: string } | null | undefined): boolean {
  if (!user) return false;
  const roleLower = (user.role || '').trim().toLowerCase();
  return roleLower === 'admin';
}

export function getOrgMemberDetails(rawId: string, email?: string) {
  const idLower = rawId.trim().toLowerCase();
  const defaultName = rawId.includes('@') ? rawId.split('@')[0] : rawId;
  return {
    name: defaultName.charAt(0).toUpperCase() + defaultName.slice(1),
    role: 'member' as UserRole,
    designation: 'Team Member',
    department: 'General',
    employeeId: undefined as string | undefined,
    email: rawId.includes('@') ? rawId : `${idLower}@example.com`,
  };
}

function mapDatabaseProfile(row: any): User {
  return {
    id: row.id,
    employeeId: row.employee_id || '',
    name: row.name || 'Team Member',
    email: row.email || '',
    avatar: row.avatar || '',
    role: (row.role as UserRole) || 'member',
    department: row.department || 'Engineering',
    designation: row.designation || 'Software Engineer',
    phone: row.phone || '',
    joinDate: row.join_date || (row.created_at ? row.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
    status: row.status || 'active',
    activeProjects: row.active_projects || 0,
    lastActive: row.last_active || row.updated_at || new Date().toISOString(),
    bio: row.bio || '',
    skills: row.skills || [],
    bankAccountNumber: row.bank_account_number || row.bankAccountNumber || '',
    ifsc: row.ifsc_code || row.ifsc || '',
    organizationId: row.organization_id || '',
    portfolioUrl: row.portfolio_url || '',
    githubUrl: row.github_url || '',
    linkedinUrl: row.linkedin_url || '',
  };
}

interface AuthState {
  currentUser: User | null;
  currentRole: UserRole;
  effectiveRole: 'admin' | 'manager' | 'member';
  isAuthenticated: boolean;
  isLoading: boolean;
  activeOrganization: string;
  setActiveOrganization: (name: string) => void;
  login: (identifier: string, password: string) => Promise<{ success: boolean; role?: 'admin' | 'manager' | 'member'; error?: string }>;
  signUp: (data: { email: string; password: string; name: string; department?: string; designation?: string; employeeId?: string; orgName?: string; isInvite?: boolean }) => Promise<{ success: boolean; session?: boolean; requiresEmailConfirmation?: boolean; role?: 'admin' | 'manager' | 'member'; error?: string }>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
  initializeAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      currentRole: 'member',
      effectiveRole: 'member',
      isAuthenticated: false,
      isLoading: true,
      activeOrganization: 'Hyna Studio',
      setActiveOrganization: (name: string) => set({ activeOrganization: name }),

      login: async (identifier: string, password: string) => {
        try {
          set({ isLoading: true });
          const rawId = identifier.trim();
          let emailToUse = rawId;

          if (!rawId.includes('@')) {
            const { data: matchedProfile } = await supabase
              .from('profiles')
              .select('email, employee_id, name')
              .or(`employee_id.ilike.${rawId},name.ilike.${rawId}`)
              .maybeSingle();

            if (matchedProfile?.email) {
              emailToUse = matchedProfile.email;
            } else {
              set({ isLoading: false });
              return {
                success: false,
                error: `No account found for "${rawId}". Please use your work email address to sign in.`,
              };
            }
          }

          let { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
            email: emailToUse,
            password,
          });

          if (signInError || !authData?.user) {
            set({ isLoading: false });
            let msg = signInError?.message || 'Authentication failed';
            const lowerMsg = msg.toLowerCase();
            if (lowerMsg.includes('email not confirmed')) {
              msg = 'Email address has not been confirmed yet. Please check your inbox or disable "Confirm email" in Supabase Dashboard.';
            } else if (lowerMsg.includes('invalid login credentials') || lowerMsg.includes('invalid credentials')) {
              msg = 'Incorrect email/employee ID or password. Please check your credentials and try again.';
            }
            return { success: false, error: msg };
          }

          const userId = authData.user.id;

          let { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();

          let user: User;
          if (profileError || !profileData) {
            const meta = authData.user.user_metadata || {};
            user = {
              id: userId,
              name: meta.name || authData.user.email?.split('@')[0] || 'Team Member',
              email: authData.user.email || '',
              avatar: '',
              role: (meta.role as UserRole) || 'member',
              department: meta.department || 'General',
              designation: meta.designation || 'Team Member',
              phone: '',
              joinDate: new Date().toISOString().split('T')[0],
              status: 'active',
              activeProjects: 0,
              lastActive: new Date().toISOString(),
            };
          } else {
            user = mapDatabaseProfile(profileData);
          }

          const role = computeEffectiveRole(user);
          
          // Self-heal organization ID for legacy accounts or accounts created without it
          const activeOrg = get().activeOrganization;
          if (!user.organizationId && activeOrg) {
             const { error: updateErr } = await supabase
               .from('profiles')
               .update({ organization_id: activeOrg })
               .eq('id', user.id);
             if (!updateErr) {
               user.organizationId = activeOrg;
             }
          }

          set({
            currentUser: user,
            currentRole: user.role,
            effectiveRole: role,
            isAuthenticated: true,
            isLoading: false,
          });

          return { success: true, role };
        } catch (err: any) {
          set({ isLoading: false });
          return { success: false, error: err?.message || 'Unexpected login error' };
        }
      },

      signUp: async ({ email, password, name, department, designation, employeeId, orgName, isInvite }) => {
        try {
          set({ isLoading: true });
          const regEmail = email.trim();
          const nameLower = name.trim().toLowerCase();
          const emailLower = regEmail.toLowerCase();
          const empIdUpper = (employeeId || '').trim().toUpperCase();

          let userRole: UserRole = (orgName && !isInvite) ? 'admin' : 'member';
          let userDesignation = designation?.trim() || (userRole === 'admin' ? 'Admin' : 'Software Engineer');
          let userDepartment = department?.trim() || (userRole === 'admin' ? 'Executive' : 'Engineering');
          let userEmpId = employeeId?.trim() || undefined;

          const { data: authData, error: signUpError } = await supabase.auth.signUp({
            email: regEmail,
            password,
            options: {
              data: {
                name: name.trim(),
                department: userDepartment,
                designation: userDesignation,
                role: userRole,
                employee_id: userEmpId,
              },
            },
          });

          if (signUpError || !authData.user) {
            set({ isLoading: false });
            let msg = signUpError?.message || 'Registration failed';
            const lowerMsg = msg.toLowerCase();
            if (lowerMsg.includes('rate limit')) {
              msg = 'Supabase email send limit reached. Please disable "Confirm email" in Supabase Dashboard (Authentication -> Providers -> Email) to allow instant registration.';
            }
            return { success: false, error: msg };
          }

          // If session was created automatically (email confirmation disabled)
          if (authData.session) {
            const userId = authData.user.id;

            let finalOrgId: string | undefined = undefined;

            if (orgName) {
              // Directly use the provided organization name as the organization_id identifier
              finalOrgId = orgName.trim();
            }

            // Attempt to ensure profile exists in database
            let { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', userId)
              .maybeSingle();

            if (!profile) {
              const { data: createdProfile } = await supabase
                .from('profiles')
                .insert({
                  id: userId,
                  employee_id: userEmpId,
                  organization_id: finalOrgId,
                  name: name.trim(),
                  email: regEmail,
                  department: userDepartment,
                  designation: userDesignation,
                  role: userRole,
                  status: 'active',
                })
                .select()
                .maybeSingle();

              if (createdProfile) profile = createdProfile;
            }

            const newUser: User = profile ? mapDatabaseProfile(profile) : {
              id: userId,
              employeeId: userEmpId || '',
              name: name.trim(),
              email: regEmail,
              avatar: '',
              role: userRole,
              department: userDepartment,
              designation: userDesignation,
              phone: '',
              joinDate: new Date().toISOString().split('T')[0],
              status: 'active',
              activeProjects: 0,
              lastActive: new Date().toISOString(),
            };

            const role = computeEffectiveRole(newUser);
            set({
              currentUser: newUser,
              currentRole: newUser.role,
              effectiveRole: role,
              isAuthenticated: true,
              isLoading: false,
            });

            return { success: true, session: true, requiresEmailConfirmation: false, role };
          } else {
            // User registered, but email confirmation is pending in Supabase
            const role = userRole === 'admin' ? 'admin' : userRole === 'manager' ? 'manager' : 'member';
            set({ isLoading: false });
            return { success: true, session: false, requiresEmailConfirmation: true, role };
          }
        } catch (err: any) {
          set({ isLoading: false });
          return { success: false, error: err?.message || 'Registration error' };
        }
      },

      logout: async () => {
        try {
          await supabase.auth.signOut();
        } catch (e) {
          console.warn('SignOut error:', e);
        } finally {
          set({
            currentUser: null,
            currentRole: 'member',
            effectiveRole: 'member',
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      setUser: (user: User) => {
        const role = computeEffectiveRole(user);
        set({ currentUser: user, currentRole: user.role, effectiveRole: role });
      },

      initializeAuth: async () => {
        try {
          set({ isLoading: true });
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();

          if (sessionError || !session?.user) {
            set({
              currentUser: null,
              currentRole: 'member',
              effectiveRole: 'member',
              isAuthenticated: false,
              isLoading: false,
            });
            return;
          }

          const userId = session.user.id;
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

          if (profile) {
            const user = mapDatabaseProfile(profile);
            const role = computeEffectiveRole(user);
            set({
              currentUser: user,
              currentRole: user.role,
              effectiveRole: role,
              isAuthenticated: true,
              isLoading: false,
            });
          } else {
            // Check users view
            const { data: fallbackUser } = await supabase
              .from('users')
              .select('*')
              .eq('id', userId)
              .single();

            if (fallbackUser) {
              const user = mapDatabaseProfile(fallbackUser);
              const role = computeEffectiveRole(user);
              set({
                currentUser: user,
                currentRole: user.role,
                effectiveRole: role,
                isAuthenticated: true,
                isLoading: false,
              });
            } else {
              set({
                currentUser: null,
                currentRole: 'member',
                effectiveRole: 'member',
                isAuthenticated: false,
                isLoading: false,
              });
            }
          }
        } catch (err) {
          console.error('Error initializing auth:', err);
          set({
            currentUser: null,
            currentRole: 'member',
            effectiveRole: 'member',
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },
    }),
    {
      name: 'hyna-auth-state',
      partialize: (state) => ({
        currentUser: state.currentUser,
        currentRole: state.currentRole,
        effectiveRole: state.effectiveRole,
        isAuthenticated: state.isAuthenticated,
        activeOrganization: state.activeOrganization,
      }),
    }
  )
);

// ---- Sidebar State ----
interface SidebarState {
  isCollapsed: boolean;
  isMobileOpen: boolean;
  toggle: () => void;
  toggleMobile: () => void;
  setCollapsed: (collapsed: boolean) => void;
  setMobileOpen: (open: boolean) => void;
}

export const useSidebarStore = create<SidebarState>()((set) => ({
  isCollapsed: false,
  isMobileOpen: false,
  toggle: () => set((s) => ({ isCollapsed: !s.isCollapsed })),
  toggleMobile: () => set((s) => ({ isMobileOpen: !s.isMobileOpen })),
  setCollapsed: (collapsed) => set({ isCollapsed: collapsed }),
  setMobileOpen: (open) => set({ isMobileOpen: open }),
}));

// ---- Theme State ----
export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
}

const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'dark',
      resolvedTheme: 'dark',
      setMode: (mode) => set({
        mode,
        resolvedTheme: mode === 'system' ? getSystemTheme() : mode,
      }),
    }),
    {
      name: 'hyna-theme',
    }
  )
);
