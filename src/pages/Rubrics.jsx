import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/PageHeader';
import Field from '@/components/Field';
import { money } from '@/lib/format';

const CATS = [['provento', 'Proventos'], ['desconto', 'Descontos'], ['informativa', 'Informativas'], ['redutora', 'Redutoras']];
const EMPTY = { name: '', category: 'provento', description: '', fixed_value: '', auto_apply: false };

export default function Rubrics() {
  const [list, setList] = useState([]);
  const [f, setF] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const { toast } = useToast();
  const load = () => base44.entities.Rubric.filter({}, { sort: 'name', limit: 200 }).then((r) => setList(r.items));
  useEffect(() => { load(); }, []);

  const save = async () => {
    const data = { ...f, fixed_value: Number(f.fixed_value) || 0, auto_apply: !!f.auto_apply && Number(f.fixed_value) > 0 };
    if (editId) await base44.entities.Rubric.update(editId, data);
    else await base44.entities.Rubric.create(data);
    toast({ title: 'Rubrica salva' });
    setF(EMPTY); setEditId(null); load();
  };

  return (
    <div>
      <PageHeader code="RF09" title="Rubricas" description="Classifique os valores da folha. Rubricas com valor fixo podem ser aplicadas automaticamente em toda folha." />
      <div className="mb-8 space-y-4 border border-border bg-card p-5">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <Field label="Nome da rubrica"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Categoria">
            <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Valor fixo (opcional)"><Input type="number" step="0.01" value={f.fixed_value} onChange={(e) => setF({ ...f, fixed_value: e.target.value })} /></Field>
        </div>
        <Field label="Descrição"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!f.auto_apply} onCheckedChange={(v) => setF({ ...f, auto_apply: !!v })} />Aplicar o valor fixo automaticamente em toda folha</label>
        <div className="flex gap-2">
          <Button disabled={!f.name.trim()} onClick={save}>{editId ? 'Atualizar' : 'Salvar'}</Button>
          {editId && <Button variant="ghost" onClick={() => { setEditId(null); setF(EMPTY); }}>Cancelar</Button>}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {CATS.map(([cat, label]) => (
          <div key={cat} className="border border-border bg-card">
            <p className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            {list.filter((r) => r.category === cat).map((r) => (
              <div key={r.id} className="flex items-center justify-between border-b border-border/60 px-4 py-2 text-sm">
                <div>
                  <p>{r.name}{r.auto_apply && <span className="ml-2 font-mono text-[11px] text-emerald-700">auto · {money(r.fixed_value)}</span>}</p>
                  {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                </div>
                <button className="text-xs text-emerald-700 underline" onClick={() => { setEditId(r.id); setF({ ...EMPTY, ...r, fixed_value: r.fixed_value || '' }); }}>Alterar</button>
              </div>
            ))}
            {list.filter((r) => r.category === cat).length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">Nenhuma rubrica.</p>}
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">A aplicação das rubricas redutoras ainda está pendente de definição e não altera o cálculo.</p>
    </div>
  );
}