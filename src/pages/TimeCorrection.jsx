import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/PageHeader';
import Field from '@/components/Field';
import Empty from '@/components/Empty';
import EmployeePicker from '@/components/EmployeePicker';
import { KINDS } from '@/components/time/TimeTable';
import { fmtDate, competenceLabel } from '@/lib/format';

export default function TimeCorrection() {
  const [params] = useSearchParams();
  const [emp, setEmp] = useState(null);
  const [date, setDate] = useState(params.get('date') || '');
  const [records, setRecords] = useState([]);
  const [sel, setSel] = useState(null);
  const [time, setTime] = useState('');
  const [just, setJust] = useState('');
  const [locked, setLocked] = useState(false);
  const { toast } = useToast();

  // Marcação de competência já finalizada em folha não pode ser corrigida.
  useEffect(() => {
    if (!emp || !date) return setLocked(false);
    base44.entities.Payroll.filter({ employee_id: emp.id, competence: date.slice(0, 7), status: 'finalizada' }, { limit: 1 })
      .then((r) => setLocked(r.items.length > 0));
  }, [emp, date]);

  useEffect(() => {
    const id = params.get('employee');
    if (id) base44.entities.Employee.get(id).then(setEmp);
  }, [params]);

  const load = useCallback(async () => {
    if (!emp || !date) return;
    const r = await base44.entities.TimeRecord.filter({ employee_id: emp.id, date }, { limit: 10 });
    setRecords(KINDS.map(([k]) => r.items.find((x) => x.kind === k)).filter(Boolean));
  }, [emp, date]);
  useEffect(() => { load(); setSel(null); }, [load]);

  const save = async () => {
    const previous = sel.corrected_time || sel.original_time;
    const corrections = [...(sel.corrections || []), { previous, time, justification: just.trim(), at: new Date().toISOString() }];
    await base44.entities.TimeRecord.update(sel.id, { corrected_time: time, justification: just.trim(), corrections });
    toast({ title: 'Correção registrada', description: 'A marcação original foi preservada.' });
    setSel(null); setTime(''); setJust(''); load();
  };

  const label = (k) => KINDS.find(([x]) => x === k)[1];

  return (
    <div className="space-y-6">
      <PageHeader code="RF08" title="Correção de ponto" description="A marcação original nunca é apagada: a correção é registrada com justificativa e histórico." />
      <div className="grid gap-4 md:grid-cols-[1fr_200px]">
        <Field label="Funcionário"><EmployeePicker value={emp} onChange={setEmp} /></Field>
        <Field label="Data da marcação"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      {locked && (
        <p className="border border-destructive bg-red-50 px-4 py-3 text-sm text-destructive">
          A folha de {competenceLabel(date.slice(0, 7))} deste funcionário está finalizada — as marcações do período não podem mais ser corrigidas.
        </p>
      )}
      {emp && date && records.length === 0 && <Empty>Nenhuma marcação encontrada para {fmtDate(date)}.</Empty>}
      <div className="space-y-3">
        {records.map((r) => (
          <div key={r.id} className="border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-6 text-sm">
                <span className="w-32 font-medium">{label(r.kind)}</span>
                <span>Original: <span className="font-mono">{r.original_time}</span></span>
                <span>Atual: <span className="font-mono font-semibold text-emerald-700">{r.corrected_time || r.original_time}</span></span>
              </div>
              <Button variant="outline" size="sm" disabled={locked} onClick={() => { setSel(r); setTime(r.corrected_time || r.original_time); setJust(''); }}>Corrigir</Button>
            </div>
            {(r.corrections || []).length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                {r.corrections.map((c, i) => <li key={i}>{new Date(c.at).toLocaleString('pt-BR')} · <span className="font-mono">{c.previous} → {c.time}</span> · {c.justification}</li>)}
              </ul>
            )}
            {sel?.id === r.id && (
              <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-[160px_1fr_auto] sm:items-end">
                <Field label="Marcação corrigida"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
                <Field label="Justificativa"><Textarea rows={2} value={just} onChange={(e) => setJust(e.target.value)} /></Field>
                <Button disabled={!time || !just.trim()} onClick={save}>Salvar correção</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}