import { Navigate, Outlet } from 'react-router-dom';
import { useSession } from '@/lib/SessionContext';

export default function RequireMaster() {
  const { session } = useSession();
  if (!session) return <Navigate to="/login" replace />;
  if (!session.master) return <Navigate to="/" replace />;
  return <Outlet />;
}