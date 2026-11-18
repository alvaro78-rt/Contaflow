import { Navigate, Outlet } from 'react-router-dom';
import { useSession } from '@/lib/SessionContext';

export default function AdminOnly({ management = false }) {
  const { session } = useSession();
  // A conta mestre, depois de entrar em uma empresa, administra como o dono dela.
  if (session?.master && session?.company_id) return <Outlet />;
  const allowed = management ? ['admin', 'gerente'] : ['admin'];
  return allowed.includes(session?.role) ? <Outlet /> : <Navigate to="/" replace />;
}
