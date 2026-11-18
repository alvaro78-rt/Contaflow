import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
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
  const isAdmin = session?.role === 'admin';
  const [emp, setEmp] = useState(null);
  const [month, setMonth] = useState(currentCompetence());
  const [records, setRecords] = useState([]);
  const [schedule, setSchedule] = useState(null);

  const load = useCallback(async () => {
    if (!emp) return;
    const r = await base44.entities.TimeRecord.filter({ employee_id: emp.id, date: { $gte: `${month}-01`, $lte: `${month}-31` } }, { sort: 'date', limit: 500 });
    setRecords(r.items);
    setSchedule(emp.schedule_id ? await base44.entities.WorkSchedule.get(emp.schedule_id) : null);
  }, [emp, month]);
  useEffect(() => { load(); }, [load]);

  const st = monthStats(records, schedule, month);
  const cards = [['Horas trabalhadas', `${fmtMin(st.worked)}h`], ['Faltas', st.absences], ['Atrasos', `${fmtMin(st.late)}h`], ['Horas extras', `${fmtMin(st.overtime)}h`]];

  return (
    <div className="space-y-6">
      <PageHeader code="RF07" title="Controle de ponto" description="Marcações do leitor biométrico, com faltas, atrasos (tolerância de 5 min) e horas extras (limite de 2h por dia)." />
      <div className="grid gap-4 md:grid-cols-[1fr_200px]">
        <Field label="Funcionário"><EmployeePicker value={emp} onChange={setEmp} /></Field>
        <Field label="Mês"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
      </div>
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