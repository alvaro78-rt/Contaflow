import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Building2, Plus, RefreshCw } from 'lucide-react';
import { MODULES } from '@/lib/modules';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/SessionContext';
import { competenceLabel, money } from '@/lib/format';

const SESSION_ERRORS = ['sessao_invalida', 'sessao_expirada', 'acesso_encerrado', 'conta_desligada'];
const MANAGER_MODULES = ['/funcionarios/novo', '/funcionarios', '/cargos', '/jornadas', '/ponto', '/folha', '/contracheques'];

// Painel ContaFlow: números verificados no servidor, módulos e gestão de empresas
// visíveis sem expor operações de mestre a colaboradores.
export default function CompanyPanel() {
  const { session, logout } = useSession();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('companyDashboard', { token: session?.token });
      if (!res.data?.ok) throw new Error(res.data?.error || 'falha');
      setData(res.data);
    } catch (err) {
      const code = err?.data?.error ?? err?.response?.data?.error;
      if (SESSION_ERRORS.includes(code)) {
        logout('expired');
        navigate('/login?expired=1', { replace: true });
        return;
      }
      setData(null);
      setError('Não foi possível carregar os dados da empresa. Os valores não serão apresentados como zero.');
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
  const visibleModules = session?.role === 'gerente'
    ? MODULES.filter((m) => MANAGER_MODULES.includes(m.path))
    : MODULES;

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-blue-950 to-blue-900 p-6 text-white shadow-sm sm:p-9">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border border-white/10" aria-hidden="true" />
        <div className="relative flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-sky-200">ContaFlow · Painel administrativo</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {data?.company?.name || session?.company_name || 'Sua empresa'}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-200">
              Funcionários, ponto, folha de pagamento e contracheques em um só lugar.
            </p>
            <p className="mt-3 text-xs text-sky-200">
              {data ? `Perfil de ${data.profile?.name || session?.name || 'gestão'} · Competência ${competenceLabel(data.competence)}` : 'Consultando informações da empresa…'}
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
          <p role="alert" className="rounded-lg border border-destructive/30 bg-red-50 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {stats.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <p className="font-mono text-xl font-semibold tracking-tight sm:text-2xl">{value}</p>
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
          {visibleModules.map(({ path, code, title, desc, icon: Icon }) => (
            <Link key={path} to={path} className="group rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-700">
                  <Icon className="h-5 w-5" strokeWidth={1.7} />
                </span>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{desc}</p>
              <span className="mt-4 block font-mono text-[10px] text-muted-foreground">{code}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
