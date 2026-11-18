import { useEffect, useState } from 'react';
import { employeeCatalog, employeeError, searchEmployees } from '@/api/employeeAdmin';
import { useSession } from '@/lib/SessionContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/PageHeader';
import Field from '@/components/Field';
import Empty from '@/components/Empty';
import { formatCpf } from '@/lib/format';

export default function Positions() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ code: '', name: '' });
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState(null);
  const [members, setMembers] = useState([]);
  const [available, setAvailable] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [assignBusy, setAssignBusy] = useState(false);
  const { toast } = useToast();
  const { session } = useSession();
  const token = session?.token;
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const { positions } = await employeeCatalog(token);
      setList(positions);
    } catch (err) {
      setError(employeeError(err, 'Não foi possível carregar os cargos.'));
    }
  };
  useEffect(() => { load(); }, [token, session?.company_id]);

  const save = async () => {
    setError('');
    if (!form.code.trim() || !form.name.trim()) return setError('Preencha o código e o nome do cargo.');
    setBusy(true);
    try {
      await employeeCatalog(token, { action: 'savePosition', id: editId || undefined, record: form });
      toast({ title: editId ? 'Cargo atualizado' : 'Cargo cadastrado' });
      setForm({ code: '', name: '' });
      setEditId(null);
      await load();
    } catch (err) {
      setError(employeeError(err, 'Não foi possível salvar o cargo.'));
    } finally {
      setBusy(false);
    }
  };

  const view = async (position) => {
    setError('');
    try {
      const [assigned, all] = await Promise.all([
        searchEmployees(token, { position_id: position.id, limit: 200 }),
        searchEmployees(token, { status: 'ativo', limit: 200 }),
      ]);
      setMembers(assigned.employees || []);
      setAvailable((all.employees || []).filter(e => e.position_id !== position.id && e.access_role !== 'master'));
      setSelectedEmployee('');
      setViewing(position);
    } catch (err) {
      setError(employeeError(err, 'Não foi possível carregar os funcionários do cargo.'));
    }
  };

  const assign = async () => {
    if (!viewing || !selectedEmployee || assignBusy) return;
    setError('');
    setAssignBusy(true);
    try {
      await employeeCatalog(token, {
        action: 'assignPosition',
        position_id: viewing.id,
        employee_id: selectedEmployee,
      });
      toast({ title: 'Funcionário vinculado ao cargo' });
      await view(viewing);
    } catch (err) {
      setError(employeeError(err, 'Não foi possível vincular o funcionário ao cargo.'));
    } finally {
      setAssignBusy(false);
    }
  };

  return (
    <div>
      <PageHeader code="RF05" title="Cargos" description="Crie e edite cargos, veja os funcionários e vincule funcionários existentes a cada cargo." />
      <div className="mb-8 grid gap-3 border border-border bg-card p-5 sm:grid-cols-[160px_1fr_auto] sm:items-end">
        <Field label="Código"><Input className="font-mono" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
        <Field label="Nome do cargo"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <div className="flex gap-2">
          <Button onClick={save} disabled={busy}>{editId ? 'Atualizar' : 'Salvar'}</Button>
          {editId && <Button variant="ghost" onClick={() => { setEditId(null); setForm({ code: '', name: '' }); }}>Cancelar</Button>}
        </div>
        {error && <p className="text-sm text-destructive sm:col-span-3">{error}</p>}
      </div>
      {list.length === 0 ? <Empty>Nenhum cargo cadastrado.</Empty> : (
        <div className="divide-y divide-border border border-border bg-card">
          {list.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-5 py-3">
              <div><span className="mr-3 font-mono text-xs text-muted-foreground">{p.code}</span><span className="font-medium">{p.name}</span></div>
              <div className="space-x-3 text-xs">
                <button className="text-emerald-700 underline" onClick={() => view(p)}>Funcionários</button>
                <button className="text-emerald-700 underline" onClick={() => { setEditId(p.id); setForm({ code: p.code, name: p.name }); }}>Alterar</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{viewing?.name}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <label htmlFor="cargo-funcionario" className="text-sm font-medium">Adicionar funcionário a este cargo</label>
            <div className="flex flex-wrap gap-2">
              <select id="cargo-funcionario" className="min-w-0 flex-1 border border-border bg-background px-3 py-2 text-sm" value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}>
                <option value="">Selecione um funcionário ativo</option>
                {available.map(e => <option key={e.id} value={e.id}>{e.full_name} — {formatCpf(e.cpf)}</option>)}
              </select>
              <Button type="button" disabled={!selectedEmployee || assignBusy} onClick={assign}>
                {assignBusy ? 'Vinculando…' : 'Adicionar'}
              </Button>
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {available.length >= 200 && <p className="text-xs text-muted-foreground">Limite de 200 funcionários na seleção. Para localizar outros, use o cadastro completo.</p>}
          </div>
          <p className="text-xs text-muted-foreground">Funcionários atualmente vinculados</p>
          {members.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum funcionário neste cargo.</p> : members.map((m) => (
            <div key={m.id} className="flex justify-between border-b border-border/60 py-1.5 text-sm"><span>{m.full_name}</span><span className="font-mono text-xs">{formatCpf(m.cpf)}</span></div>
          ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}