import { Navigate, Outlet } from 'react-router-dom';
import { useSession } from '@/lib/SessionContext';

export default function RequireMaster() {
  const { session, expired } = useSession();
  if (!session) return <Navigate to={expired ? '/login?expired=1' : '/login'} replace />;
  if (!session.master) return <Navigate to="/" replace />;
  return <Outlet />;
}