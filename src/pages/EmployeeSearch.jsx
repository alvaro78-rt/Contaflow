
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  employeeCatalog,
  employeeError,
  getEmployee,
  searchEmployees,
} from '@/api/employeeAdmin';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import PageHeader from '@/components/PageHeader';
import Empty from '@/components/Empty';
import EmployeeDetails from '@/components/employees/EmployeeDetails';
import DeleteEmployeeDialog from '@/components/employees/DeleteEmployeeDialog';
import StatusBadge from '@/components/employees/StatusBadge';

import { useSession } from '@/lib/SessionContext';
import { ROLE_LABEL } from '@/lib/auth';
import { formatCpf, money } from '@/lib/format';

export default function EmployeeSearch() {
  const { session } = useSession();
  const token = session?.token;

  const [by, setBy] = useState('name');
  const [q, setQ] = useState('');
  const [positionId, setPositionId] = useState('');
  const [status, setStatus] = useState('');
  const [positions, setPositions] = useState([]);
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState(null);

  const filters = useRef({});
  const request = useRef(0);
  const viewRequest = useRef(0);

  const load = async (params, cursor) => {
    if (!token) return;

    const current = ++request.current;

    setLoading(true);
    setError('');

    try {
      const page = await searchEmployees(token, {
        ...params,
        cursor,
      });

      if (current !== request.current) return;

      setResults((rows) =>
        cursor
          ? [...(rows || []), ...page.employees]
          : page.employees
      );

      setNextCursor(page.next_cursor || null);
    } catch (err) {
      if (current !== request.current) return;

      setError(
        employeeError(
          err,
          'Não foi possível consultar os funcionários.'
        )
      );

      if (!cursor) setResults(null);
    } finally {
      if (current === request.current) {
        setLoading(false);
      }
    }
  };

  const search = () => {
    if (loading || !token) return;

    if (by === 'position' && !positionId) {
      setError('Selecione um cargo para pesquisar.');
      return;
    }

    filters.current = {
      by,
      term: q.trim(),
      position_id:
        by === 'position' ? positionId : undefined,
      status,
    };

    setNextCursor(null);

    return load(filters.current);
  };

  useEffect(() => {
    let active = true;

    setResults(null);
    setSelected(null);
    setToDelete(null);
    setNextCursor(null);
    setPositions([]);
    setError('');

    filters.current = {};

    if (!token) {
      setLoading(false);
      return undefined;
    }

    employeeCatalog(token)
      .then((catalog) => {
        if (active) {
          setPositions(catalog.positions || []);
        }
      })
      .catch((err) => {
        if (active) {
          setError(
            employeeError(
              err,
              'Não foi possível carregar os cargos.'
            )
          );
        }
      });

    load(filters.current);

    return () => {
      active = false;
      request.current += 1;
      viewRequest.current += 1;
    };
  }, [token, session?.company_id]);

  const clearFilters = () => {
    setBy('name');
    setQ('');
    setPositionId('');
    setStatus('');
    setError('');
    setNextCursor(null);

    filters.current = {};

    load(filters.current);
  };

  const view = async (id) => {
    const current = ++viewRequest.current;

    setError('');

    try {
      const { employee } = await getEmployee(token, id);

      if (current === viewRequest.current) {
        setSelected(employee);
      }
    } catch (err) {
      if (current === viewRequest.current) {
        setError(
          employeeError(
            err,
            'Não foi possível visualizar o funcionário.'
          )
        );
      }
    }
  };

  const posName = (id) =>
    positions.find((p) => p.id === id)?.name || '—';

  const canManage = (employee) => {
    if (employee.access_role === 'master') return false;

    if (session?.role === 'gerente') {
      return (
        (employee.access_role || 'funcionario') ===
        'funcionario'
      );
    }

    return ['master', 'admin'].includes(session?.role);
  };

  const canView = (employee) =>
    session?.role !== 'gerente' ||
    employee.id === session?.id ||
    (employee.access_role || 'funcionario') ===
      'funcionario';

  return (
    <div className="space-y-5">

      <PageHeader
        code="RF04"
        title="Consulta de funcionários"
        description="Pesquise funcionários por nome, CPF, cargo ou situação."
      />

      <div className="rounded-md border border-border bg-card p-4">

        <div className="grid gap-3 md:grid-cols-[150px_1fr_180px_auto_auto]">

          <Select
            value={by}
            onValueChange={(value) => {
              setBy(value);
              setQ('');
              setPositionId('');
              setError('');
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pesquisar por" />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="name">
                Nome
              </SelectItem>

              <SelectItem value="cpf">
                CPF
              </SelectItem>

              <SelectItem value="position">
                Cargo
              </SelectItem>
            </SelectContent>
          </Select>

          {by === 'position' ? (
            <Select
              value={positionId || undefined}
              onValueChange={setPositionId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o cargo" />
              </SelectTrigger>

              <SelectContent>
                {positions.map((position) => (
                  <SelectItem
                    key={position.id}
                    value={position.id}
                  >
                    {position.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={by === 'cpf' ? formatCpf(q) : q}
              onChange={(event) =>
                setQ(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') search();
              }}
              inputMode={by === 'cpf' ? 'numeric' : 'text'}
              placeholder={
                by === 'cpf'
                  ? '000.000.000-00'
                  : 'Digite o nome do funcionário'
              }
            />
          )}

          <Select
            value={status || 'todas'}
            onValueChange={(value) =>
              setStatus(value === 'todas' ? '' : value)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="todas">
                Todas as situações
              </SelectItem>

              <SelectItem value="ativo">
                Ativos
              </SelectItem>

              <SelectItem value="inativo">
                Inativos
              </SelectItem>

              <SelectItem value="afastado">
                Afastados
              </SelectItem>

              <SelectItem value="desligado">
                Desligados
              </SelectItem>
            </SelectContent>
          </Select>

          <Button
            onClick={search}
            disabled={loading}
          >
            {loading ? 'Pesquisando…' : 'Pesquisar'}
          </Button>

          <Button
            variant="outline"
            onClick={clearFilters}
            disabled={loading}
          >
            Limpar
          </Button>

        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">

        <p className="text-sm text-muted-foreground">
          {results
            ? `${results.length} funcionário(s) listado(s)`
            : 'Consulta de funcionários'}
        </p>

        {['master', 'admin', 'gerente'].includes(
          session?.role
        ) && (
          <Button variant="outline" asChild>
            <Link to="/funcionarios/novo">
              Novo funcionário
            </Link>
          </Button>
        )}

      </div>

      {error && (
        <p
          role="alert"
          className="border border-destructive bg-red-50 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {loading && (
        <p className="text-sm text-muted-foreground">
          Carregando funcionários…
        </p>
      )}

      {!loading &&
        !error &&
        results &&
        results.length === 0 && (
          <Empty>
            Nenhum funcionário corresponde aos critérios
            informados.
          </Empty>
        )}

      {results && results.length > 0 && (

        <div className="overflow-x-auto rounded-md border border-border bg-card">

          <table className="w-full text-sm">

            <thead>
              <tr className="border-b bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">CPF</th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3">Perfil</th>
                <th className="px-4 py-3">Cargo</th>

                <th className="px-4 py-3 text-right">
                  Salário-base
                </th>

                <th className="px-4 py-3 text-center">
                  Ações
                </th>
              </tr>
            </thead>

            <tbody>
              {results.map((employee) => (

                <tr
                  key={employee.id}
                  className="border-b border-border/60 hover:bg-muted/30"
                >

                  <td className="px-4 py-3 font-medium">
                    {employee.full_name}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                    {formatCpf(employee.cpf)}
                  </td>

                  <td className="px-4 py-3">
                    <StatusBadge status={employee.status} />
                  </td>

                  <td className="px-4 py-3">
                    {ROLE_LABEL[employee.access_role] ||
                      'Funcionário'}
                  </td>

                  <td className="px-4 py-3">
                    {posName(employee.position_id)}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono">
                    {money(employee.base_salary)}
                  </td>

                  <td className="px-4 py-3">

                    <div className="flex flex-wrap justify-center gap-3">

                      {canView(employee) && (
                        <button
                          type="button"
                          className="text-xs text-emerald-700 underline"
                          onClick={() => view(employee.id)}
                        >
                          Visualizar
                        </button>
                      )}

                      {canManage(employee) && (
                        <Link
                          className="text-xs text-blue-700 underline"
                          to={`/funcionarios/${employee.id}/editar`}
                        >
                          Editar
                        </Link>
                      )}

                      {canManage(employee) &&
                        employee.id !== session?.id &&
                        employee.access_role !== 'admin' && (
                          <button
                            type="button"
                            className="text-xs text-destructive underline"
                            onClick={() =>
                              setToDelete(employee)
                            }
                          >
                            Excluir
                          </button>
                        )}

                    </div>

                  </td>
                </tr>

              ))}
            </tbody>

          </table>

        </div>
      )}

      {nextCursor && (
        <Button
          variant="outline"
          disabled={loading}
          onClick={() =>
            load(filters.current, nextCursor)
          }
        >
          Carregar mais funcionários
        </Button>
      )}

      <EmployeeDetails
        employee={selected}
        positionName={
          selected
            ? posName(selected.position_id)
            : ''
        }
        onClose={() => {
          viewRequest.current += 1;
          setSelected(null);
        }}
      />

      <DeleteEmployeeDialog
        employee={toDelete}
        token={token}
        onClose={() => setToDelete(null)}
        onDeleted={() => {
          setToDelete(null);
          load(filters.current);
        }}
      />

    </div>
  );
}
