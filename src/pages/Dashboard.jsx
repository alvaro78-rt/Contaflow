import { useSession } from '@/lib/SessionContext';
import CompanyPanel from '@/components/dashboard/CompanyPanel';
import EmployeeHome from '@/components/dashboard/EmployeeHome';

// Painel conforme a empresa aberta na sessão: gestão (mestre, dono, gerente) ou área do funcionário.
export default function Dashboard() {
  const { session } = useSession();
  if (!session) return null;

  const gestao = session.master || ['admin', 'gerente'].includes(session.role);
  if (session.company_id && gestao) return <CompanyPanel />;
  if (session.company_id) return <EmployeeHome session={session} />;

  return <CompanyPanel />;
}