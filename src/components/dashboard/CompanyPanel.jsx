import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Building2, Plus, RefreshCw } from 'lucide-react';
import { MODULES } from '@/lib/modules';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/SessionContext';
import { competenceLabel, money } from '@/lib/format';
import { describeDashboardError } from '@/lib/dashboardError';

const SESSION_ERRORS = ['sessao_invalida', 'sessao_expirada', 'acesso_encerrado', 'conta_desligada'];
const MANAGER_MODULES = ['/funcionarios/novo', '/funcionarios', '/cargos', '/jornadas', '/ponto', '/folha', '/contracheques'];

// Painel ContaFlow: números verificados no servidor, módulos e gestão de empresas
// visíveis sem expor operações de mestre a colaboradores.
export default function CompanyPanel() {
  const { session, logout } = useSession();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('companyDashboard', { token: session?.token });
      if (!res.data?.ok) throw { response: { status: res.status, data: res.data } };
      setData(res.data);
    } catch (err) {
      const code = err?.data?.error ?? err?.response?.data?.error;
      if (SESSION_ERRORS.includes(code)) {
        logout('expired');
        navigate('/login?expired=1', { replace: true });
        return;
      }
      setData(null);
      setError(describeDashboardError(err));
    } finally {
      setLoading(false);
    }
  }, [session?.token, logout, navigate]);

  useEffect(() => { load(); }, [load]);

  const stats = data
    ? [
        ['Funcionários ativos', data.counts.ativos ?? 'Indisponível'],
        ['Afastados', data.counts.afastados ?? 'Indisponível'],
        ['Sem acesso criado', data.counts.sem_acesso ?? 'Indisponível'],
        ...(data.payroll ? [
          [`Folhas · ${competenceLabel(data.competence)}`, data.payroll.folhas ?? 'Indisponível'],
          ['Finalizadas', data.payroll.finalizadas ?? 'Indisponível'],
          ['Total de proventos', data.payroll.proventos == null ? 'Indisponível' : money(data.payroll.proventos)],
          ['Total de descontos', data.payroll.descontos == null ? 'Indisponível' : money(data.payroll.descontos)],
          ['Líquido a pagar', data.payroll.liquido == null ? 'Indisponível' : money(data.payroll.liquido)],
        ] : []),
      ]
    : [];
  // Oculta somente o cartão de diagnóstico; mantém as permissões dos demais módulos.
  const visibleModules = MODULES.filter((m) =>
    m.path !== '/diagnostico' && m.code !== 'RF21' &&
    (session?.role !== 'gerente' || MANAGER_MODULES.includes(m.path))
  );

  return (
    <div className="cf-dashboard space-y-6">
      <section className="cf-dashboard-hero relative isolate overflow-hidden rounded-2xl p-6 text-white shadow-sm sm:p-8">
        <div className="cf-hero-ring pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full" aria-hidden="true" />
        <div className="relative flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-sky-200">Painel administrativo</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {data?.company?.name || session?.company_name || 'Sua empresa'}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-200">
              Funcionários, ponto, folha de pagamento e contracheques em um só lugar.
            </p>
            <p className="mt-3 text-xs text-sky-200">
              {data ? `Perfil de ${data.profile?.name || session?.name || 'gestão'} · Competência ${competenceLabel(data.competence)}` : loading ? 'Consultando informações da empresa…' : error ? 'Consulta indisponível — confira o diagnóstico abaixo.' : 'Aguardando dados da empresa.'}
            </p>
          </div>
          {session?.master && (
            <div className="flex w-full flex-wrap gap-2 lg:w-auto">
              <Link
                to="/empresas"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
              >
                <Building2 className="h-4 w-4" /> Minhas empresas
              </Link>
              <Link
                to="/empresas#criar"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-blue-950 transition-colors hover:bg-sky-100"
              >
                <Plus className="h-4 w-4" /> Criar empresa
              </Link>
            </div>
          )}
        </div>
      </section>

      <section aria-label="Resumo da empresa" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Visão geral</h2>
            <p className="text-sm text-muted-foreground">Indicadores confirmados pelo servidor, sem valores presumidos.</p>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
        {loading && !data && <p className="text-sm text-muted-foreground">Carregando os números desta empresa…</p>}
        {error && (
          <div role="alert" className="space-y-2 rounded-lg border border-destructive/30 bg-red-50 px-4 py-3 text-sm text-destructive">
            <p>{error.message}</p>
            <p className="font-mono text-xs">companyDashboard · {error.details}</p>
            {session?.master && error.chooseCompany && (
              <Link className="inline-flex rounded-md border border-destructive/30 bg-white px-3 py-2 font-medium underline underline-offset-2" to="/empresas">
                Selecionar empresa
              </Link>
            )}
          </div>
        )}
        {stats.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map(([label, value]) => (
              <div key={label} className="cf-dashboard-stat rounded-xl border border-border bg-card p-4 shadow-sm">
                <p className="font-mono text-xl font-semibold tracking-tight text-primary sm:text-2xl">{value}</p>
                <p className="mt-2 text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Módulos do ContaFlow" className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Módulos do sistema</h2>
          <p className="text-sm text-muted-foreground">Escolha a atividade que deseja realizar.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleModules.map(({ path, title, desc, icon: Icon }) => (
            <Link key={path} to={path} className="cf-module-card group rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-700">
                  <Icon className="h-5 w-5" strokeWidth={1.7} />
                </span>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
