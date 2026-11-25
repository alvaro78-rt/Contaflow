import { useCallback, useEffect, useState } from 'react';
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
  const { session } = useSession();
  const queryEmployeeId = params.get('employee');
  const [emp, setEmp] = useState(null);
  const [date, setDate] = useState(params.get('date') || '');
  const [records, setRecords] = useState([]);
  const [sel, setSel] = useState(null);
  const [time, setTime] = useState('');
  const [just, setJust] = useState('');
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    let active = true;
    if (queryEmployeeId && session?.token) {
      getEmployee(session.token, queryEmployeeId)
        .then(({ employee }) => { if (active) setEmp(employee); })
        .catch(() => { if (active) setError('Funcionário não localizado nesta empresa.'); });
    }
    return () => { active = false; };
  }, [queryEmployeeId, session?.token, session?.company_id]);

  const load = useCallback(async () => {
    if (!emp || !date || !session?.token) {
      setRecords([]);
      setLocked(false);
      return;
    }
    try {
      const result = await rh(session, 'time', { employee_id: emp.id, date });
      setRecords(KINDS.map(([k]) => result.items.find((x) => x.kind === k)).filter(Boolean));
      setLocked(Boolean(result.locked));
      setError('');
    } catch (err) {
      setRecords([]);
      setLocked(true);
      setError(err.message || 'Não foi possível consultar o ponto.');
    }
  }, [emp?.id, date, session?.token, session?.company_id]);
  useEffect(() => { load(); setSel(null); }, [load]);

  const save = async () => {
    if (!sel || !time || !just.trim() || locked) return;
    try {
      await rh(session, 'correctMark', {
        employee_id: emp.id, date, id: sel.id, time, reason: just.trim(),
        previous: sel.corrected_time || sel.original_time,
        revision: (sel.corrections || []).length,
      });
      toast({ title: 'Correção registrada', description: 'A marcação original foi preservada.' });
      setSel(null); setTime(''); setJust('');
      await load();
    } catch (err) {
      setError(err.message || 'Não foi possível registrar a correção.');
    }
  };

  const label = (k) => KINDS.find(([x]) => x === k)[1];

  return (
    <div className="space-y-6">
      <PageHeader code="RF08" title="Correção de ponto" description="A marcação original nunca é apagada: a correção é registrada com justificativa e histórico." />
      <div className="grid gap-4 md:grid-cols-[1fr_200px]">
        <Field label="Funcionário"><EmployeePicker value={emp} onChange={setEmp} /></Field>
        <Field label="Data da marcação"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
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
