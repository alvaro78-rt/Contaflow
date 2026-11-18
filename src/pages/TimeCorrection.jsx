import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getEmployee } from '@/api/employeeAdmin';
import { rh } from '@/api/rh';
import { useSession } from '@/lib/SessionContext';
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

  const { session } = useSession();
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    const id = params.get('employee');
    if (id) getEmployee(session.token, id).then(r => { if (current) setEmp(r.employee); })
      .catch(() => { if (current) setError('Funcionário não encontrado nesta empresa.'); });
    return () => { current = false; };
  }, [params, session]);
  useEffect(() => {
    let current = true;
    setSel(null); setRecords([]); setLocked(true); setError('');
    if (emp && date) rh(session, 'time', { employee_id: emp.id, date })
      .then(r => { if (current) { setRecords(r.items); setLocked(r.locked); } })
      .catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [emp, date, session, revision]);
  const save = async () => {
    try {
      await rh(session, 'correctMark', { employee_id: emp.id, date, id: sel.id, time, reason: just,
        previous: sel.corrected_time || sel.original_time, revision: (sel.corrections || []).length });
      toast({ title: 'Correção registrada' });
      setSel(null); setRevision(n => n + 1);
    } catch (e) { setError(e.message); }
  };

  const label = (k) => KINDS.find(([x]) => x === k)?.[1] || k;

  return (
    <div className="space-y-6">
      <PageHeader code="RF08" title="Correção de ponto" description="A marcação original nunca é apagada: a correção é registrada com justificativa e histórico." />
      <div className="grid gap-4 md:grid-cols-[1fr_200px]">
        <Field label="Funcionário"><EmployeePicker value={emp} onChange={setEmp} /></Field>
        <Field label="Data da marcação"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      {error && <p role="alert">{error}</p>}
      {locked && records.length > 0 && (
        <p className="border border-destructive bg-red-50 px-4 py-3 text-sm text-destructive">
          A folha de {competenceLabel(date.slice(0, 7))} deste funcionário já foi registrada — as marcações do período não podem mais ser corrigidas.
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