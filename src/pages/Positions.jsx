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
      const { employees } = await searchEmployees(token, { position_id: position.id });
      setMembers(employees);
      setViewing(position);
    } catch (err) {
      setError(employeeError(err, 'Não foi possível carregar os funcionários do cargo.'));
    }
  };

  return (
    <div>
      <PageHeader code="RF05" title="Cargos" description="Cadastre cargos com códigos únicos e veja os funcionários vinculados a cada um." />
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
          {members.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum funcionário neste cargo.</p> : members.map((m) => (
            <div key={m.id} className="flex justify-between border-b border-border/60 py-1.5 text-sm"><span>{m.full_name}</span><span className="font-mono text-xs">{formatCpf(m.cpf)}</span></div>
          ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}