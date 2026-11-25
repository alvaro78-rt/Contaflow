import { useEffect, useState } from 'react';
import { rh } from '@/api/rh';
import { useSession } from '@/lib/SessionContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/PageHeader';
import Field from '@/components/Field';
import { money } from '@/lib/format';

const CATS = [['provento', 'Proventos'], ['desconto', 'Descontos'], ['informativa', 'Informativas'], ['redutora', 'Redutoras']];
const EMPTY = { name: '', category: 'provento', description: '', fixed_value: '', auto_apply: false, incidence_reviewed: false };

export default function Rubrics() {
  const {session} = useSession();
  const [error, setError] = useState('');
  const [list, setList] = useState([]);
  const [f, setF] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const { toast } = useToast();
  const load = async () => {
    try {
      let cursor;
      const rows = [];
      do {
        const page = await rh(session, 'rubrics', { cursor });
        rows.push(...page.items); cursor = page.next_cursor;
      } while (cursor);
      setList(rows); setError('');
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, [session]);

  const save = async () => {
    try {
      await rh(session, 'saveRubric', {id: editId, record: { ...f, fixed_value: Number(f.fixed_value) }});
    } catch (e) { setError(e.message); return; }
    toast({ title: 'Rubrica salva' });
    setF(EMPTY); setEditId(null); load();
  };

  return (
    <div>
      {error && <p role="alert">{error}</p>}
      <PageHeader code="RF09" title="Rubricas" description="Classifique os valores da folha. Rubricas com valor fixo podem ser aplicadas automaticamente em toda folha." />
      <div className="mb-8 space-y-4 border border-border bg-card p-5">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <Field label="Nome da rubrica"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Categoria">
            <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v, incidence_reviewed: false })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Valor fixo (opcional)"><Input type="number" step="0.01" value={f.fixed_value} onChange={(e) => setF({ ...f, fixed_value: e.target.value })} /></Field>
        </div>
        <Field label="Descrição"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!f.auto_apply} onCheckedChange={(v) => setF({ ...f, auto_apply: !!v })} />Aplicar o valor fixo automaticamente em toda folha</label>
        {f.auto_apply && f.category !== 'informativa' && <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={!!f.incidence_reviewed} onCheckedChange={v => setF({ ...f, incidence_reviewed: v === true })} />
          {f.category === 'provento' ? 'Conferi que esta verba integra integralmente INSS, IRRF e FGTS.' : 'Conferi que este desconto é aplicado ao líquido, sem reduzir bases tributárias.'}
        </label>}
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
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2 text-sm">
                <div className="min-w-0 break-words">
                  <p>{r.name}{r.auto_apply && <span className="ml-2 font-mono text-[11px] text-emerald-700">auto · {money(r.fixed_value)}</span>}</p>
                  {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                </div>
                <button className="shrink-0 text-xs text-emerald-700 underline" onClick={() => { setEditId(r.id); setF({ ...EMPTY, ...r, fixed_value: r.fixed_value || '' }); }}>Alterar</button>
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
