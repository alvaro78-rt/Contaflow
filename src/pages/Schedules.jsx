import { useEffect, useState } from 'react';
import { employeeCatalog, employeeError } from '@/api/employeeAdmin';
import { useSession } from '@/lib/SessionContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/PageHeader';
import Field from '@/components/Field';
import Empty from '@/components/Empty';
import { WEEKDAYS } from '@/lib/format';
import { scheduledMinutes, fmtMin } from '@/lib/payroll';

const EMPTY = { name: '', weekly_hours: '', work_days: [1, 2, 3, 4, 5], entry_time: '08:00', exit_time: '17:00', break_start: '12:00', break_end: '13:00' };

export default function Schedules() {
  const [list, setList] = useState([]);
  const [f, setF] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const { toast } = useToast();
  const { session } = useSession();
  const token = session?.token;
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const { schedules } = await employeeCatalog(token);
      setList(schedules);
    } catch (err) {
      setError(employeeError(err, 'Não foi possível carregar as jornadas.'));
    }
  };
  useEffect(() => { load(); }, [token, session?.company_id]);

  const suggested = f.entry_time && f.exit_time ? (scheduledMinutes(f) * f.work_days.length) / 60 : 0;
  const toggle = (d) => setF({ ...f, work_days: f.work_days.includes(d) ? f.work_days.filter((x) => x !== d) : [...f.work_days, d].sort() });

  const save = async () => {
    setError('');
    if (!f.name.trim() || !Number(f.weekly_hours) || !f.work_days.length) return setError('Informe nome, carga horária semanal e ao menos um dia de trabalho.');
    if (f.exit_time <= f.entry_time) return setError('O horário de saída deve ser depois da entrada.');
    const data = { ...f, weekly_hours: Number(f.weekly_hours) };
    setBusy(true);
    try {
      await employeeCatalog(token, { action: 'saveSchedule', id: editId || undefined, record: data });
      toast({ title: editId ? 'Jornada atualizada' : 'Jornada cadastrada' });
      setF(EMPTY);
      setEditId(null);
      await load();
    } catch (err) {
      setError(employeeError(err, 'Não foi possível salvar a jornada.'));
    } finally {
      setBusy(false);
    }
  };

  const t = (k, l, type = 'time') => <Field label={l}><Input type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>;

  return (
    <div>
      <PageHeader code="RF06" title="Jornadas e horários" description="Registre qualquer jornada da empresa, como 40h (seg–sex) ou 44h (seg–sáb)." />
      <div className="mb-8 space-y-4 border border-border bg-card p-5">
        <div className="grid gap-3 sm:grid-cols-2">{t('name', 'Nome da jornada', 'text')}{t('weekly_hours', 'Carga horária semanal (h)', 'number')}</div>
        <Field label="Dias de trabalho">
          <div className="flex flex-wrap gap-4">
            {WEEKDAYS.map((l, d) => (
              <label key={d} className="flex items-center gap-2 text-sm"><Checkbox checked={f.work_days.includes(d)} onCheckedChange={() => toggle(d)} />{l}</label>
            ))}
          </div>
        </Field>
        <div className="grid gap-3 sm:grid-cols-4">{t('entry_time', 'Entrada')}{t('break_start', 'Início do intervalo')}{t('break_end', 'Fim do intervalo')}{t('exit_time', 'Saída')}</div>
        <p className="text-xs text-muted-foreground">Pelos horários informados: {fmtMin(Math.max(0, scheduledMinutes(f) || 0))}h por dia · {suggested.toFixed(1)}h por semana.</p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button onClick={save} disabled={busy}>{editId ? 'Atualizar' : 'Salvar'}</Button>
          {editId && <Button variant="ghost" onClick={() => { setEditId(null); setF(EMPTY); }}>Cancelar</Button>}
        </div>
      </div>
      {list.length === 0 ? <Empty>Nenhuma jornada cadastrada.</Empty> : (
        <div className="divide-y divide-border border border-border bg-card">
          {list.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
              <div className="min-w-0 break-words">
                <p className="font-medium">{s.name} <span className="font-mono text-xs text-muted-foreground">{s.weekly_hours}h/sem</span></p>
                <p className="text-xs text-muted-foreground">{s.work_days.map((d) => WEEKDAYS[d]).join(', ')} · {s.entry_time}–{s.exit_time} · intervalo {s.break_start || '—'}–{s.break_end || '—'}</p>
              </div>
              <button className="shrink-0 text-xs text-emerald-700 underline" onClick={() => { setEditId(s.id); setF({ ...EMPTY, ...s }); }}>Alterar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
