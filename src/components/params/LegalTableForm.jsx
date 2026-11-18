import { useState } from 'react';
import { rh } from '@/api/rh';
import { useSession } from '@/lib/SessionContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import Field from '@/components/Field';
import BandsEditor from '@/components/params/BandsEditor';

export const EMPTY_TABLE = {
  label: '', start_competence: '', end_competence: '', active: true,
  inss_bands: [], irrf_bands: [], irrf_dependent_deduction: 0, irrf_simplified_discount: 0,
  fgts_rate: 0.08, overtime_rate: 1.5, overtime_cap_minutes: 120, tolerance_minutes: 5,
  absence_divisor: 30, notes: '',
};

export default function LegalTableForm({ initial, onSaved, onCancel }) {
  const {session} = useSession();
  const [f, setF] = useState({ ...EMPTY_TABLE, ...(initial || {}) });
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });

  const save = async () => {
    const errs = [];
    if (!f.label.trim()) errs.push('Informe um nome para a tabela.');
    if (!f.start_competence) errs.push('Informe a competência inicial da vigência.');
    if (f.end_competence && f.end_competence < f.start_competence) errs.push('A vigência final não pode ser anterior à inicial.');
    if (!(f.inss_bands || []).length) errs.push('Cadastre ao menos uma faixa de INSS.');
    if (!(f.irrf_bands || []).length) errs.push('Cadastre ao menos uma faixa de IRRF.');
    if ((f.inss_bands || []).some((b) => !(Number(b.limit) > 0) || !(Number(b.rate) > 0))) errs.push('Toda faixa de INSS precisa de limite e alíquota maiores que zero.');
    if ((f.irrf_bands || []).some((b) => !(Number(b.limit) > 0))) errs.push('Toda faixa de IRRF precisa de um limite maior que zero.');
    setErrors(errs);
    if (initial?.id) {
      if (f.end_competence && f.end_competence < f.start_competence) return;
    } else if (errs.length) return;

    setBusy(true);
    const data = {
      ...f,
      label: f.label.trim(),
      fgts_rate: Number(f.fgts_rate),
      overtime_rate: Number(f.overtime_rate),
      overtime_cap_minutes: Number(f.overtime_cap_minutes),
      tolerance_minutes: Number(f.tolerance_minutes),
      absence_divisor: Number(f.absence_divisor) || 30,
      irrf_dependent_deduction: Number(f.irrf_dependent_deduction) || 0,
      irrf_simplified_discount: Number(f.irrf_simplified_discount) || 0,
    };
    delete data.id;
    delete data.created_date;
    delete data.updated_date;
    delete data.created_by_id;
    try {
      const saved = await rh(session,'saveLegalTable',{id:initial?.id,record:data});
      toast({ title: 'Tabela legal salva' });
      onSaved(saved.record);
    } catch (e) { setErrors([e.message]); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5 border border-border bg-card p-5">
      {initial?.id ? <div className="space-y-3"><p>{initial.label} · Vigência inicial {initial.start_competence}</p>
        <Field label="Vigência final"><Input type="month" value={f.end_competence} onChange={set('end_competence')} /></Field>
        <label><Checkbox checked={f.active} onCheckedChange={active => setF({...f,active:active === true})} /> Tabela ativa</label>
      </div> : <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome da tabela" className="sm:col-span-2"><Input value={f.label} onChange={set('label')} placeholder="Ex.: Tabela oficial 2026" /></Field>
        <Field label="Vigência inicial (competência)"><Input type="month" value={f.start_competence} onChange={set('start_competence')} /></Field>
        <Field label="Vigência final (vazio = em vigor)"><Input type="month" value={f.end_competence} onChange={set('end_competence')} /></Field>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v === true })} />
        <span className="text-sm">Disponível para uso no cálculo</span>
      </div>
      <BandsEditor title="INSS — faixas progressivas" hint="Cada faixa tributa apenas a parcela do salário dentro dela." bands={f.inss_bands} onChange={(b) => setF({ ...f, inss_bands: b })} />
      <BandsEditor title="IRRF — faixas" hint="Imposto = base × alíquota − parcela a deduzir." bands={f.irrf_bands} onChange={(b) => setF({ ...f, irrf_bands: b })} withDeduction />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Dedução por dependente (R$)"><Input type="number" step="0.01" className="font-mono" value={f.irrf_dependent_deduction} onChange={set('irrf_dependent_deduction')} /></Field>
        <Field label="Desconto simplificado (R$)"><Input type="number" step="0.01" className="font-mono" value={f.irrf_simplified_discount} onChange={set('irrf_simplified_discount')} /></Field>
        <Field label="FGTS (%)"><Input type="number" step="0.01" className="font-mono" value={(Number(f.fgts_rate) * 100).toFixed(2)} onChange={(e) => setF({ ...f, fgts_rate: Number(e.target.value) / 100 })} /></Field>
        <Field label="Adicional de hora extra (%)"><Input type="number" step="1" className="font-mono" value={Math.round((Number(f.overtime_rate) - 1) * 100)} onChange={(e) => setF({ ...f, overtime_rate: 1 + Number(e.target.value) / 100 })} /></Field>
        <Field label="Limite diário de horas extras (min)"><Input type="number" className="font-mono" value={f.overtime_cap_minutes} onChange={set('overtime_cap_minutes')} /></Field>
        <Field label="Tolerância de marcação (min)"><Input type="number" className="font-mono" value={f.tolerance_minutes} onChange={set('tolerance_minutes')} /></Field>
      </div>
      <Field label="Fonte e observações"><Textarea rows={3} value={f.notes} onChange={set('notes')} placeholder="Origem dos valores (portaria, lei, orientação da contabilidade) e data da conferência." /></Field>
      </>}
      {errors.length > 0 && <ul className="border border-destructive bg-red-50 px-3 py-2 text-sm text-destructive">{errors.map((e) => <li key={e}>• {e}</li>)}</ul>}
      <div className="flex gap-3">
        <Button onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar tabela'}</Button>
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}