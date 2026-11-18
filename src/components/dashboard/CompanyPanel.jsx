import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, Users, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/SessionContext';
import { competenceLabel, money } from '@/lib/format';

const SESSION_ERRORS = ['sessao_invalida', 'sessao_expirada', 'acesso_encerrado'];

// Painel da empresa em uso, lido no servidor com a sessão validada.
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
      const code = err?.response?.data?.error || '';
      if (SESSION_ERRORS.includes(code)) {
        logout();
        navigate('/login?expired=1', { replace: true });
        return;
      }
      setData(null);
      setError('Não foi possível carregar o painel desta empresa. Nenhum número é exibido como zero.');
    } finally {
      setLoading(false);
    }
  }, [session?.token, logout, navigate]);

  useEffect(() => { load(); }, [load]);

  const stats = data
    ? [
        ['Funcionários ativos', data.counts.ativos],
        ['Afastados', data.counts.afastados],
        ['Sem acesso criado', data.counts.sem_acesso],
        [`Folhas · ${competenceLabel(data.competence)}`, data.payroll.folhas],
        ['Finalizadas', data.payroll.finalizadas],
        ['Total de proventos', money(data.payroll.proventos)],
        ['Total de descontos', money(data.payroll.descontos)],
        ['Líquido a pagar', money(data.payroll.liquido)],
      ]
    : [];

  return (
    <div className="space-y-8">
      <div className="border-b border-border pb-6">
        <p className="mb-2 font-mono text-xs text-emerald-700">[EMPRESA EM USO]</p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          {data?.company?.name || session?.company_name || 'Empresa'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {data ? `Perfil ${data.profile.name ? `de ${data.profile.name}` : ''} · competência ${competenceLabel(data.competence)}` : 'Lendo os dados da empresa…'}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/funcionarios" className="group border border-border bg-card p-5 transition-colors hover:bg-accent">
          <Users className="mb-4 h-5 w-5 text-primary group-hover:text-emerald-700" strokeWidth={1.5} />
          <p className="font-semibold">Funcionários</p>
          <p className="text-sm text-muted-foreground">Veja quem já tem acesso nesta empresa.</p>
        </Link>
        <Link to="/funcionarios/novo" className="group border border-border bg-card p-5 transition-colors hover:bg-accent">
          <UserPlus className="mb-4 h-5 w-5 text-primary group-hover:text-emerald-700" strokeWidth={1.5} />
          <p className="font-semibold">Novo funcionário</p>
          <p className="text-sm text-muted-foreground">Cadastre nome, CPF e a senha inicial.</p>
        </Link>
      </div>

      {loading && !data && <p className="text-sm text-muted-foreground">Carregando os números desta empresa…</p>}

      {error && (
        <div className="space-y-3">
          <p className="border border-destructive bg-red-50 px-3 py-2 text-sm text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5" /> {loading ? 'Tentando…' : 'Tentar novamente'}
          </Button>
        </div>
      )}

      {stats.length > 0 && (
        <div className="grid grid-cols-2 gap-px border border-border bg-border md:grid-cols-4">
          {stats.map(([k, v]) => (
            <div key={k} className="bg-card px-4 py-4">
              <p className="font-mono text-xl font-semibold">{v}</p>
              <p className="text-xs text-muted-foreground">{k}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}