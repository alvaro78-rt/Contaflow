import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { MODULES } from '@/lib/modules';
import { useSession } from '@/lib/SessionContext';
import { ROLE_LABEL } from '@/lib/auth';

export default function Layout() {
  const { pathname } = useLocation();
  const { session, logout } = useSession();
  const navigate = useNavigate();
  const section = MODULES.find((m) => pathname === m.path || (m.path !== '/' && pathname.startsWith(m.path + '/')));
  const leave = async () => {
    try { await base44.functions.invoke('authCpf', { action: 'logout', token: session.token }); }
    catch { /* encerra também a sessão local */ }
    finally { logout(); navigate('/login', { replace: true }); }
  };
  const switchCompany = () => navigate('/empresas');
  return (
    <div className="min-h-screen">
      <header className="cf-app-header sticky top-0 z-30 print:hidden">
        <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <Link to="/" className="flex shrink-0 items-center gap-3 font-semibold tracking-tight">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-lg font-bold text-primary">C</span>
            <span className="leading-tight">Conta<span className="text-green-300">Flow</span></span>
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            {pathname !== '/' && (
              <Link to="/" className="cf-header-action flex items-center gap-1 px-3 py-2 text-sm"><ArrowLeft className="h-4 w-4"/> Painel</Link>
            )}
            <div className="min-w-0 text-right">
              <p className="truncate text-xs font-medium leading-tight">{session?.name}</p>
              <p className="text-[10px] uppercase tracking-wide text-blue-100">{ROLE_LABEL[session?.role]}</p>
            </div>
            <button type="button" onClick={leave} title="Sair" className="cf-header-action flex shrink-0 items-center gap-1.5 px-3 py-2 text-xs font-medium"><LogOut className="h-4 w-4"/> Sair</button>
          </div>
        </div>
        <div className="cf-app-subbar flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-5 py-2 text-center text-xs">
          <span>{session?.company_name || 'Conta mestre'}</span>
          {section && <span>· [{section.code}] {section.title}</span>}
          {session?.master && session?.company_id && <button type="button" onClick={switchCompany} className="font-medium text-green-300 underline underline-offset-2">Minhas empresas · Criar empresa</button>}
        </div>
      </header>
      <main className="cf-app-main mx-auto max-w-6xl px-5 py-8 print:p-0"><Outlet/></main>
    </div>
  );
}
