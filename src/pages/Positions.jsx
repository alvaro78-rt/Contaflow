
import { useEffect, useState } from 'react';
import {
  employeeCatalog,
  employeeError,
  searchEmployees,
} from '@/api/employeeAdmin';

import { useSession } from '@/lib/SessionContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/PageHeader';
import Field from '@/components/Field';
import Empty from '@/components/Empty';
import { formatCpf } from '@/lib/format';

const REQUIRED_MESSAGE =
  'Ainda existem campos obrigatórios não preenchidos. Verifique as informações e tente novamente.';

export default function Positions() {
  const { session } = useSession();
  const token = session?.token;
  const { toast } = useToast();

  const [list, setList] = useState([]);
  const [form, setForm] = useState({
    code: '',
    name: '',
  });

  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const [viewing, setViewing] = useState(null);
  const [members, setMembers] = useState([]);
  const [available, setAvailable] = useState([]);
  const [selectedEmployee, setSelectedEmployee] =
    useState('');

  const [assignBusy, setAssignBusy] = useState(false);
  const [viewError, setViewError] = useState('');
  const [viewLoading, setViewLoading] = useState(false);

  const [toDelete, setToDelete] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const { positions } = await employeeCatalog(token);

      setList(positions || []);
    } catch (err) {
      setError(
        employeeError(
          err,
          'Não foi possível carregar os cargos.'
        )
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setList([]);
    setViewing(null);
    setToDelete(null);
    setEditId(null);
    setError('');
    setForm({ code: '', name: '' });

    load();
  }, [token, session?.company_id]);

  const reset = () => {
    setForm({
      code: '',
      name: '',
    });

    setEditId(null);
    setError('');
  };

  const save = async (event) => {
    event?.preventDefault();

    if (busy || !token) return;

    setError('');

    const code = form.code.trim();
    const name = form.name.trim();

    if (!code || !name) {
      setError(REQUIRED_MESSAGE);
      return;
    }

    if (code.length > 50) {
      setError(
        'O código deve possuir no máximo 50 caracteres.'
      );
      return;
    }

    if (name.length > 200) {
      setError(
        'O nome deve possuir no máximo 200 caracteres.'
      );
      return;
    }

    const duplicate = list.some(
      (position) =>
        String(position.code).trim().toUpperCase() ===
          code.toUpperCase() &&
        position.id !== editId
    );

    if (duplicate) {
      setError(
        'Já existe um cargo cadastrado com este código.'
      );
      return;
    }

    setBusy(true);

    try {
      await employeeCatalog(token, {
        action: 'savePosition',
        expected_company_id: session.company_id,
        id: editId || undefined,
        record: {
          code,
          name,
        },
      });

      toast({
        title: editId
          ? 'Cargo atualizado com sucesso'
          : 'Cargo cadastrado com sucesso',
      });

      reset();
      await load();

    } catch (err) {
      setError(
        employeeError(
          err,
          'Não foi possível salvar o cargo.'
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const edit = (position) => {
    setError('');
    setEditId(position.id);

    setForm({
      code: position.code,
      name: position.name,
    });
  };

  const loadEmployees = async (params) => {
    const rows = [];
    const seen = new Set();

    let cursor;

    do {
      const response = await searchEmployees(token, {
        ...params,
        limit: 200,
        cursor,
      });

      for (const employee of response.employees || []) {
        if (!seen.has(employee.id)) {
          seen.add(employee.id);
          rows.push(employee);
        }
      }

      const next = response.next_cursor || null;

      if (next && next === cursor) {
        throw new Error('paginacao_invalida');
      }

      cursor = next;
    } while (cursor);

    return rows;
  };

  const view = async (position) => {
    setViewing(position);
    setViewError('');
    setMembers([]);
    setAvailable([]);
    setSelectedEmployee('');
    setViewLoading(true);

    try {
      const [assigned, all] = await Promise.all([
        loadEmployees({
          position_id: position.id,
        }),

        loadEmployees({
          status: 'ativo',
        }),
      ]);

      setMembers(assigned);

      setAvailable(
        all.filter(
          (employee) =>
            employee.position_id !== position.id &&
            employee.access_role !== 'master' &&
            (
              session?.role !== 'gerente' ||
              (employee.access_role || 'funcionario') ===
                'funcionario'
            )
        )
      );

    } catch (err) {
      setViewError(
        employeeError(
          err,
          'Não foi possível carregar os funcionários do cargo.'
        )
      );
    } finally {
      setViewLoading(false);
    }
  };

  const assign = async () => {
    if (!viewing || !selectedEmployee || assignBusy) {
      return;
    }

    setAssignBusy(true);
    setViewError('');

    try {
      await employeeCatalog(token, {
        action: 'assignPosition',
        expected_company_id: session.company_id,
        position_id: viewing.id,
        employee_id: selectedEmployee,
      });

      toast({
        title: 'Funcionário vinculado ao cargo',
      });

      await view(viewing);

    } catch (err) {
      setViewError(
        employeeError(
          err,
          'Não foi possível vincular o funcionário.'
        )
      );
    } finally {
      setAssignBusy(false);
    }
  };

  const remove = async () => {
    if (!toDelete || deleteBusy || !token) return;

    setDeleteBusy(true);
    setDeleteError('');

    try {
      await employeeCatalog(token, {
        action: 'deletePosition',
        expected_company_id: session.company_id,
        id: toDelete.id,
      });

      if (editId === toDelete.id) {
        reset();
      }

      toast({
        title: 'Cargo excluído com sucesso',
      });

      setToDelete(null);
      await load();

    } catch (err) {
      setDeleteError(
        employeeError(
          err,
          'Não foi possível excluir o cargo.'
        )
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="space-y-6">

      <PageHeader
        code="RF05"
        title="Cadastro de cargos"
        description="Cadastre, consulte, altere e organize os cargos da empresa."
      />

      <form
        onSubmit={save}
        className="grid gap-4 border border-border bg-card p-5 sm:grid-cols-[160px_1fr_auto] sm:items-end"
      >

        <Field label="Código *">
          <Input
            className="font-mono"
            value={form.code}
            maxLength={50}
            placeholder="Ex.: 001"
            onChange={(event) =>
              setForm({
                ...form,
                code: event.target.value,
              })
            }
          />
        </Field>

        <Field label="Nome do cargo *">
          <Input
            value={form.name}
            maxLength={200}
            placeholder="Ex.: Contador"
            onChange={(event) =>
              setForm({
                ...form,
                name: event.target.value,
              })
            }
          />
        </Field>

        <div className="flex gap-2">

          <Button type="submit" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </Button>

          {editId && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={reset}
            >
              Cancelar
            </Button>
          )}

        </div>

        {error && (
          <p
            role="alert"
            className="border border-destructive bg-red-50 p-3 text-sm text-destructive sm:col-span-3"
          >
            {error}
          </p>
        )}

      </form>

      <div className="flex items-center justify-between">

        <h2 className="font-semibold">
          Cargos cadastrados
        </h2>

        <span className="text-xs text-muted-foreground">
          {list.length} cargo(s)
        </span>

      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">
          Carregando cargos…
        </p>
      ) : list.length === 0 ? (
        <Empty>Nenhum cargo cadastrado.</Empty>
      ) : (

        <div className="overflow-x-auto border border-border bg-card">

          <table className="w-full text-sm">

            <thead>
              <tr className="border-b bg-secondary/60 text-left text-xs uppercase text-muted-foreground">

                <th className="px-5 py-3">
                  Código
                </th>

                <th className="px-5 py-3">
                  Nome do cargo
                </th>

                <th className="px-5 py-3 text-right">
                  Ações
                </th>

              </tr>
            </thead>

            <tbody>

              {list.map((position) => (

                <tr
                  key={position.id}
                  className="border-b border-border/60"
                >

                  <td className="px-5 py-3 font-mono">
                    {position.code}
                  </td>

                  <td className="px-5 py-3 font-medium">
                    {position.name}
                  </td>

                  <td className="px-5 py-3">

                    <div className="flex flex-wrap justify-end gap-4">

                      <button
                        type="button"
                        className="text-xs text-emerald-700 underline"
                        onClick={() => view(position)}
                      >
                        Funcionários
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        className="text-xs text-blue-700 underline"
                        onClick={() => edit(position)}
                      >
                        Alterar
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        className="text-xs text-destructive underline"
                        onClick={() => {
                          setDeleteError('');
                          setToDelete(position);
                        }}
                      >
                        Excluir
                      </button>

                    </div>

                  </td>

                </tr>
              ))}

            </tbody>

          </table>

        </div>
      )}

      {/* Funcionários vinculados ao cargo */}

      <Dialog
        open={!!viewing}
        onOpenChange={(open) => {
          if (!open && !assignBusy) {
            setViewing(null);
          }
        }}
      >

        <DialogContent className="max-h-[85vh] overflow-y-auto">

          <DialogHeader>
            <DialogTitle>
              Funcionários — {viewing?.name}
            </DialogTitle>
          </DialogHeader>

          {viewLoading ? (
            <p className="text-sm text-muted-foreground">
              Carregando funcionários…
            </p>
          ) : (

            <>

              <div className="space-y-3">

                <label
                  htmlFor="cargo-funcionario"
                  className="text-sm font-medium"
                >
                  Vincular funcionário ao cargo
                </label>

                <div className="flex flex-wrap gap-2">

                  <select
                    id="cargo-funcionario"
                    className="min-w-0 flex-1 border border-border bg-background px-3 py-2 text-sm"
                    value={selectedEmployee}
                    onChange={(event) =>
                      setSelectedEmployee(
                        event.target.value
                      )
                    }
                  >

                    <option value="">
                      Selecione um funcionário
                    </option>

                    {available.map((employee) => (
                      <option
                        key={employee.id}
                        value={employee.id}
                      >
                        {employee.full_name}
                        {' — '}
                        {formatCpf(employee.cpf)}
                      </option>
                    ))}

                  </select>

                  <Button
                    type="button"
                    disabled={
                      !selectedEmployee || assignBusy
                    }
                    onClick={assign}
                  >
                    {assignBusy
                      ? 'Vinculando…'
                      : 'Adicionar'}
                  </Button>

                </div>

              </div>

              <p className="text-sm font-semibold">
                Funcionários vinculados ({members.length})
              </p>

              {members.length === 0 ? (

                <p className="text-sm text-muted-foreground">
                  Nenhum funcionário está vinculado a este cargo.
                </p>

              ) : (

                members.map((employee) => (

                  <div
                    key={employee.id}
                    className="flex justify-between gap-3 border-b border-border/60 py-2 text-sm"
                  >
                    <span>
                      {employee.full_name}
                    </span>

                    <span className="font-mono text-xs">
                      {formatCpf(employee.cpf)}
                    </span>
                  </div>

                ))

              )}

            </>

          )}

          {viewError && (
            <p
              role="alert"
              className="text-sm text-destructive"
            >
              {viewError}
            </p>
          )}

        </DialogContent>

      </Dialog>

      {/* Confirmação de exclusão */}

      <Dialog
        open={!!toDelete}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) {
            setToDelete(null);
            setDeleteError('');
          }
        }}
      >

        <DialogContent>

          <DialogHeader>
            <DialogTitle>
              Excluir cargo
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm">
            Tem certeza que deseja excluir o cargo{' '}
            <strong>{toDelete?.name}</strong>?
          </p>

          <p className="text-xs text-muted-foreground">
            Cargos com funcionários vinculados não
            poderão ser excluídos.
          </p>

          {deleteError && (
            <p
              role="alert"
              className="border border-destructive bg-red-50 p-3 text-sm text-destructive"
            >
              {deleteError}
            </p>
          )}

          <div className="flex justify-end gap-3">

            <Button
              variant="outline"
              disabled={deleteBusy}
              onClick={() => setToDelete(null)}
            >
              Cancelar
            </Button>

            <Button
              variant="destructive"
              disabled={deleteBusy}
              onClick={remove}
            >
              {deleteBusy
                ? 'Excluindo…'
                : 'Confirmar exclusão'}
            </Button>

          </div>

        </DialogContent>

      </Dialog>

    </div>
  );
}
