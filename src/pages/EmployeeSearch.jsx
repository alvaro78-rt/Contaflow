import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { employeeCatalog, employeeError, getEmployee, searchEmployees } from '@/api/employeeAdmin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/PageHeader';
import Empty from '@/components/Empty';
import EmployeeDetails from '@/components/employees/EmployeeDetails';
import DeleteEmployeeDialog from '@/components/employees/DeleteEmployeeDialog';
import StatusBadge from '@/components/employees/StatusBadge';
import { useSession } from '@/lib/SessionContext';
import { ROLE_LABEL } from '@/lib/auth';
import { formatCpf, money } from '@/lib/format';

export default function EmployeeSearch() {
  const [by, setBy] = useState('name');
  const [q, setQ] = useState('');
  const [positionId, setPositionId] = useState('');
  const [status, setStatus] = useState('');
  const [positions, setPositions] = useState([]);
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const { session } = useSession();
  const token = session?.token;
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState(null);
  const filters = useRef({});
  const request = useRef(0);

  const load = async (params, cursor) => {
    const current = ++request.current;
    setLoading(true);
    setError('');
    try {
      const page = await searchEmployees(token, { ...params, cursor });
      if (current !== request.current) return;
      setResults((rows) => cursor ? [...(rows || []), ...page.employees] : page.employees);
      setNextCursor(page.next_cursor);
    } catch (err) {
      if (current !== request.current) return;
      setError(employeeError(err, 'Não foi possível consultar os funcionários.'));
      if (!cursor) setResults(null);
    } finally {
      if (current === request.current) setLoading(false);
    }
  };

  const search = () => {
    filters.current = { by, term: q, position_id: by === 'position' ? positionId : undefined, status };
    setNextCursor(null);
    return load(filters.current);
  };

  useEffect(() => {
    let active = true;
    setResults(null);
    setSelected(null);
    setToDelete(null);
    setNextCursor(null);
    filters.current = {};
    employeeCatalog(token)
      .then((catalog) => { if (active) setPositions(catalog.positions); })
      .catch((err) => { if (active) setError(employeeError(err, 'Não foi possível carregar os cargos.')); });
    load(filters.current);
    return () => { active = false; request.current += 1; };
  }, [token, session?.company_id]);

  const view = async (id) => {
    try {
      const { employee } = await getEmployee(token, id);
      setSelected(employee);
    } catch (err) {
      setError(employeeError(err, 'Não foi possível carregar os dados do funcionário.'));
    }
  };

  const posName = (id) => positions.find((p) => p.id === id)?.name || '—';

  return (
    <div>
      <PageHeader code="RF04" title="Consulta de funcionários" description="Localize funcionários por nome, CPF ou cargo.">
      </PageHeader>
      <div className="mb-6 grid gap-3 sm:grid-cols-[160px_1fr_150px_auto_auto]">
        <Select value={by} onValueChange={(v) => { setBy(v); setQ(''); }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="name">Nome</SelectItem><SelectItem value="cpf">CPF</SelectItem><SelectItem value="position">Cargo</SelectItem></SelectContent>
        </Select>
        {by === 'position' ? (
          <Select value={positionId || undefined} onValueChange={setPositionId}>
            <SelectTrigger><SelectValue placeholder="Selecione o cargo" /></SelectTrigger>
            <SelectContent>{positions.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        ) : <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder={by === 'cpf' ? '000.000.000-00' : 'Digite o nome'} />}
        <Select value={status || 'todas'} onValueChange={(v) => setStatus(v === 'todas' ? '' : v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as situações</SelectItem>
            <SelectItem value="ativo">Ativos</SelectItem>
            <SelectItem value="afastado">Afastados</SelectItem>
            <SelectItem value="desligado">Desligados</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={search} disabled={loading}>Pesquisar</Button>
        <Button variant="outline" asChild><Link to="/funcionarios/novo">Novo</Link></Button>
      </div>
      {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <p className="mb-4 text-sm text-muted-foreground">Carregando funcionários…</p>}
      {results && results.length === 0 && <Empty>Nenhum registro foi encontrado.</Empty>}
      {results && results.length > 0 && (
        <div className="overflow-x-auto border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2">Nome</th><th className="px-4 py-2">CPF</th><th className="px-4 py-2">Situação</th><th className="px-4 py-2">Perfil</th><th className="px-4 py-2">Cargo</th><th className="px-4 py-2 text-right">Salário-base</th><th />
              </tr>
            </thead>
            <tbody>
              {results.map((e) => (
                <tr key={e.id} className="border-b border-border/60">
                  <td className="px-4 py-2 font-medium">{e.full_name}</td>
                  <td className="px-4 py-2 font-mono text-xs">{formatCpf(e.cpf)}</td>
                  <td className="px-4 py-2"><StatusBadge status={e.status} /></td>
                  <td className="px-4 py-2">
                    <span className={`border px-1.5 py-0.5 text-[11px] ${['admin', 'gerente'].includes(e.access_role) ? 'border-emerald-600 bg-accent text-accent-foreground' : 'border-border text-muted-foreground'}`}>
                      {ROLE_LABEL[e.access_role] || 'Funcionário'}
                    </span>
                  </td>
                  <td className="px-4 py-2">{posName(e.position_id)}</td>
                  <td className="px-4 py-2">{e.tem_acesso ? 'Senha definida' : 'Sem senha'}</td>
                  <td className="px-4 py-2 text-right font-mono">{money(e.base_salary)}</td>
                  <td className="space-x-3 px-4 py-2 text-right">
                    <button className="text-xs text-emerald-700 underline" onClick={() => view(e.id)}>Visualizar</button>
                    <Link className="text-xs text-emerald-700 underline" to={`/funcionarios/${e.id}/editar`}>Editar</Link>
                    <button className="text-xs text-destructive underline" onClick={() => setToDelete(e)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {nextCursor && <Button className="mt-4" variant="outline" disabled={loading} onClick={() => load(filters.current, nextCursor)}>Carregar mais</Button>}
      <EmployeeDetails employee={selected} positionName={selected ? posName(selected.position_id) : ''} onClose={() => setSelected(null)} />
      <DeleteEmployeeDialog
        employee={toDelete}
        token={token}
        onClose={() => setToDelete(null)}
        onDeleted={(emp) => { setResults((r) => (r || []).filter((x) => x.id !== emp.id)); setToDelete(null); }}
      />
    </div>
  );
}