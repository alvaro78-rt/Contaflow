import { Navigate, Outlet } from 'react-router-dom';
import { useSession } from '@/lib/SessionContext';
import { ADMIN_ROLES } from '@/lib/auth';

export default function AdminOnly() {
  const { session } = useSession();
  // A conta mestre, depois de entrar em uma empresa, administra como o dono dela.
  if (session?.master && session?.company_id) return <Outlet />;
  if (!ADMIN_ROLES.includes(session?.role)) return <Navigate to="/contracheques" replace />;
  return <Outlet />;
}