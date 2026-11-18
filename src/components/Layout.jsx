import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { MODULES } from '@/lib/modules';
import { useSession } from '@/lib/SessionContext';
import { ROLE_LABEL } from '@/lib/auth';

export default function Layout() {
  const { pathname } = useLocation();
  const { session, login, logout } = useSession();
  const navigate = useNavigate();
  const section = MODULES.find((m) => pathname === m.path || (m.path !== '/' && pathname.startsWith(m.path + '/')));
  const leave = () => { logout(); navigate('/login', { replace: true }); };
  // Volta para a escolha de empresas: limpa a empresa em uso também no servidor.
  const switchCompany = async () => {
    try {
      await base44.functions.invoke('enterCompany', { token: session.token, company_id: '' });
    } catch {
      // Sem sessão válida, o login resolve; a navegação acontece de qualquer forma.
    }
    login({ id: session.id, name: session.name, role: 'master', master: true, token: session.token });
    navigate('/empresas');
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-5">
          <Link to="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-6 w-6 place-items-center bg-primary font-mono text-[11px] text-primary-foreground">F</span>
            <span className="hidden sm:inline">Folha<span className="text-emerald-600">/</span>Ledger</span>
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            {pathname !== '/' && (
              <Link to="/" className="hidden items-center gap-1 border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:border-emerald-600 hover:text-emerald-700 sm:flex">
                <ArrowLeft className="h-3.5 w-3.5" /> Painel
              </Link>
            )}
            <div className="min-w-0 text-right">
              <p className="truncate text-xs font-medium leading-tight">{session?.name}</p>
              <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{ROLE_LABEL[session?.role]}</p>
            </div>
            <button onClick={leave} title="Sair" className="flex shrink-0 items-center gap-1.5 border border-border bg-card px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-destructive hover:text-destructive">
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 border-t border-border bg-secondary/40 px-5 py-1 text-center font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>{session?.company_name || 'Conta mestre'}</span>
          {section && <span>· [{section.code}] {section.title}</span>}
          {session?.master && session?.company_id && (
            <button onClick={switchCompany} className="underline hover:text-foreground">Trocar empresa</button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-10 print:p-0">
        <Outlet />
      </main>
    </div>
  );
}