import { useEffect, useState } from 'react';
import { searchEmployees, getEmployee } from '@/api/employeeAdmin';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/SessionContext';
import { formatCpf } from '@/lib/format';

export default function EmployeePicker({ value, onChange }) {
  const { session } = useSession();
  const canChoose = ['master', 'admin', 'gerente'].includes(session?.role);
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (value || !session?.token || !session?.company_id) return;
    let active = true;
    setLoading(true);
    setError('');
    const fetchEmployees = async () => {
      try {
        if (!canChoose) {
          const result = await getEmployee(session.token, session.id);
          if (active && result.employee) onChange(result.employee);
          return;
        }
        // Usa a mesma API autorizada da tela Funcionários, não a entidade bloqueada por RLS.
        const term = q.trim();
        const result = await searchEmployees(session.token, {
          ...(term ? { term, by: /^[\d.\-\s]+$/.test(term) ? 'cpf' : 'name' } : {}),
          status: 'ativo',
          limit: 100,
        });
        if (active) setList(result.employees || []);
      } catch {
        if (active) {
          setList([]);
          setError('Não foi possível consultar os funcionários desta empresa.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchEmployees();
    return () => { active = false; };
  }, [q, value, canChoose, session?.token, session?.company_id, session?.id, onChange]);

  if (value) {
    return (
      <div className="flex items-center justify-between border border-border bg-card px-4 py-2.5">
        <div>
          <p className="font-medium">{value.full_name}</p>
          <p className="font-mono text-xs text-muted-foreground">{formatCpf(value.cpf)}</p>
        </div>
        {canChoose && <Button variant="ghost" size="sm" onClick={() => onChange(null)}>Trocar</Button>}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {canChoose && <Input placeholder="Buscar funcionário por nome ou CPF" value={q} onChange={(e) => setQ(e.target.value)} />}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="divide-y divide-border border border-border bg-card">
        {loading && <p className="px-4 py-3 text-sm text-muted-foreground">Consultando funcionários…</p>}
        {!loading && !error && list.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">Nenhum funcionário ativo encontrado.</p>}
        {!loading && list.map((e) => (
          <button type="button" key={e.id} onClick={async () => {
            setLoading(true);
            setError('');
            try {
              const result = await getEmployee(session.token, e.id);
              if (!result.employee) throw new Error('funcionario_inexistente');
              onChange(result.employee);
            } catch {
              setError('Não foi possível carregar os dados do funcionário.');
            } finally {
              setLoading(false);
            }
          }} className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-accent" disabled={loading}>
            <span className="font-medium">{e.full_name}</span>
            <span className="font-mono text-xs text-muted-foreground">{formatCpf(e.cpf)}</span>
          </button>
        ))}
      </div>
      {!loading && list.length >= 100 && <p className="text-xs text-muted-foreground">Mostrando até 100 resultados. Refine a busca para localizar outros funcionários.</p>}
    </div>
  );
}
