import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore, isExecutiveLeadership } from '@/stores';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  allowedRoles?: ('admin' | 'manager' | 'member')[];
  requireExecutiveLeadership?: boolean;
  children?: React.ReactNode;
}

export function ProtectedRoute({ allowedRoles, requireExecutiveLeadership, children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, effectiveRole, currentUser } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[var(--color-background)] text-[var(--color-foreground)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary)] flex items-center justify-center shadow-lg shadow-indigo-500/25 animate-pulse">
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          </div>
          <p className="text-sm font-medium text-[var(--color-muted-foreground)]">
            Verifying secure session & permissions...
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }


  const redirectPath =
    effectiveRole === 'admin'
      ? '/admin/dashboard'
      : effectiveRole === 'manager'
      ? '/manager/dashboard'
      : '/member/dashboard';

  if (allowedRoles && !allowedRoles.includes(effectiveRole)) {
    return <Navigate to={redirectPath} replace />;
  }

  // Strict Executive Authority Check (CEO, CTO, COO)
  if (requireExecutiveLeadership && !isExecutiveLeadership(currentUser)) {
    return <Navigate to={redirectPath} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}
