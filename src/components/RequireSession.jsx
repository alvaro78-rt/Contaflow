import { Navigate, Outlet } from 'react-router-dom';
import { useSession } from '@/lib/SessionContext';

export default function RequireSession() {
  const { session } = useSession();
  if (!session) return <Navigate to="/login" replace />;
  if (session.master && !session.company_id) return <Navigate to="/empresas" replace />;
  return <Outlet />;
}