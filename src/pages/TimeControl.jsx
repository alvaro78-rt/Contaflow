import { useCallback, useEffect, useState } from 'react';
import { rh } from '@/api/rh';
import { Input } from '@/components/ui/input';
import PageHeader from '@/components/PageHeader';
import { useSession } from '@/lib/SessionContext';
import Field from '@/components/Field';
import Empty from '@/components/Empty';
import EmployeePicker from '@/components/EmployeePicker';
import TimeTable from '@/components/time/TimeTable';
import TimeMarkForm from '@/components/time/TimeMarkForm';
import { currentCompetence } from '@/lib/format';
import EmployeeTimeClock from '@/pages/EmployeeTimeClock';
import { groupByDay, monthStats, fmtMin } from '@/lib/payroll';

export default function TimeControl() {
  const { session } = useSession();
  if (session?.role === 'funcionario') return <EmployeeTimeClock />;
  return <ManagerTimeControl />;
}

function ManagerTimeControl() {
  const { session } = useSession();
  const isAdmin = session?.role === 'admin' || session?.master;
  const [emp, setEmp] = useState(null);
  const [month, setMonth] = useState(currentCompetence());
  const [records, setRecords] = useState([]);
  const [schedule, setSchedule] = useState(null);

  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const load = useCallback(() => setRevision(n => n + 1), []);
  useEffect(() => {
    let current = true;
    setRecords([]); setSchedule(null); setError('');
    if (emp && month) rh(session, 'time', { employee_id: emp.id, competence: month })
      .then(r => { if (current) { setRecords(r.items); setSchedule(r.schedule); } })
      .catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [emp, month, session, revision]);

  const st = monthStats(records, schedule, month, undefined, emp?.admission_date);
  const cards = [['Horas trabalhadas', `${fmtMin(st.worked)}h`], ['Dias de jornada sem marcação', st.absences], ['Atrasos', `${fmtMin(st.late)}h`], ['Horas extras', `${fmtMin(st.overtime)}h`]];

  return (
    <div className="space-y-6">
      <PageHeader code="RF07" title="Controle de ponto" description="Confira as marcações originais, as correções e os dias de jornada sem registro." />
      <div className="grid gap-4 md:grid-cols-[1fr_200px]">
        <Field label="Funcionário"><EmployeePicker value={emp} onChange={setEmp} /></Field>
        <Field label="Mês"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
      </div>
      {error && <p role="alert">{error}</p>}
      {!emp ? <Empty>Selecione um funcionário para consultar as marcações.</Empty> : (
        <>
          <div className="grid grid-cols-2 gap-px border border-border bg-border md:grid-cols-4">
            {cards.map(([k, v]) => (
              <div key={k} className="bg-card px-4 py-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</p><p className="font-mono text-2xl font-semibold">{v}</p></div>
            ))}
          </div>
          {!schedule && <p className="text-sm text-destructive">Este funcionário não possui jornada vinculada; atrasos, extras e faltas não podem ser calculados.</p>}
          {isAdmin && <TimeMarkForm employeeId={emp.id} existing={records} onSaved={load} />}
          {records.length === 0 && st.absentDates.length === 0 ? <Empty>Nenhuma marcação encontrada no período.</Empty> : (
            <TimeTable days={groupByDay(records)} absentDates={st.absentDates} schedule={schedule} employeeId={emp.id} canCorrect={isAdmin} />
          )}
        </>
      )}
    </div>
  );
}