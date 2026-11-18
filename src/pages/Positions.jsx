import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
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

  const load = () => base44.entities.Position.filter({}, { sort: 'code', limit: 200 }).then((r) => setList(r.items));
  useEffect(() => { load(); }, []);

  const save = async () => {
    setError('');
    if (!form.code.trim() || !form.name.trim()) return setError('Preencha o código e o nome do cargo.');
    const dup = await base44.entities.Position.filter({ code: form.code.trim() }, { limit: 2 });
    if (dup.items.some((d) => d.id !== editId)) return setError('Já existe um cargo com este código.');
    const data = { code: form.code.trim(), name: form.name.trim() };
    if (editId) await base44.entities.Position.update(editId, data);
    else await base44.entities.Position.create(data);
    toast({ title: editId ? 'Cargo atualizado' : 'Cargo cadastrado' });
    setForm({ code: '', name: '' }); setEditId(null); load();
  };

  const view = async (p) => {
    setViewing(p);
    const r = await base44.entities.Employee.filter({ position_id: p.id }, { sort: 'full_name', limit: 100 });
    setMembers(r.items);
  };

  return (
    <div>
      <PageHeader code="RF05" title="Cargos" description="Cadastre cargos com códigos únicos e veja os funcionários vinculados a cada um." />
      <div className="mb-8 grid gap-3 border border-border bg-card p-5 sm:grid-cols-[160px_1fr_auto] sm:items-end">
        <Field label="Código"><Input className="font-mono" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
        <Field label="Nome do cargo"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <div className="flex gap-2">
          <Button onClick={save}>{editId ? 'Atualizar' : 'Salvar'}</Button>
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