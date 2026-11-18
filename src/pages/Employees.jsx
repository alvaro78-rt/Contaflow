import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';
import { useSession } from '@/lib/SessionContext';
import { formatCpf } from '@/lib/format';

const SESSION_ERRORS = ['sessao_invalida', 'sessao_expirada', 'conta_desligada'];

export default function Employees() {
  const { session, logout } = useSession();
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('listEmployees', { token: session?.token });
      if (!res.data?.ok) throw new Error(res.data?.error || 'falha');
      setRows(res.data.employees || []);
    } catch (err) {
      const code = err?.response?.data?.error || '';
      if (SESSION_ERRORS.includes(code)) {
        logout('expired');
        navigate('/login?expired=1', { replace: true });
        return;
      }
      setRows(null);
      setError('Não foi possível carregar os funcionários desta empresa.');
    } finally {
      setLoading(false);
    }
  }, [session?.token, logout, navigate]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader code="RF04" title="Funcionários" description="Somente quem está vinculado à empresa em uso aparece aqui." />

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/funcionarios/novo"><Plus className="h-4 w-4" /> Novo funcionário</Link>
        </Button>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className="h-3.5 w-3.5" /> {loading ? 'Atualizando…' : 'Atualizar'}
        </Button>
      </div>

      {error && <p className="border border-destructive bg-red-50 px-3 py-2 text-sm text-destructive">{error}</p>}

      {loading && rows === null && !error && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {rows && rows.length === 0 && (
        <p className="border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          Nenhum funcionário cadastrado nesta empresa ainda.
        </p>
      )}

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2">Nome</th>
                <th className="px-4 py-2">CPF</th>
                <th className="px-4 py-2">Situação</th>
                <th className="px-4 py-2">Acesso</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2 font-medium">{e.full_name}</td>
                  <td className="px-4 py-2 font-mono text-xs">{formatCpf(e.cpf)}</td>
                  <td className="px-4 py-2">{e.status}</td>
                  <td className="px-4 py-2">
                    <span className={`border px-1.5 py-0.5 text-[11px] ${e.tem_acesso ? 'border-emerald-600 bg-accent text-accent-foreground' : 'border-destructive text-destructive'}`}>
                      {e.tem_acesso ? 'senha definida' : 'sem senha'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}