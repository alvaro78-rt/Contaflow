import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { getEmployee } from '@/api/employeeAdmin';
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
import { groupByDay, fmtMin } from '@/lib/payroll';

export default function TimeControl() {
  const { session } = useSession();
  if (session?.role === 'funcionario') return <EmployeeTimeClock />;
  return <ManagerTimeControl />;
}

function ManagerTimeControl() {
  const { session } = useSession();
  const [params] = useSearchParams();
  const urlEmployee = params.get('employee');
  const urlCompetence = params.get('competence');
  const isAdmin = session?.role === 'admin' || session?.master;
  const [emp, setEmp] = useState(null);
  const [month, setMonth] = useState(() => /^\d{4}-(0[1-9]|1[0-2])$/.test(urlCompetence || '') ? urlCompetence : currentCompetence());
  const [records, setRecords] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [audit, setAudit] = useState(null);

  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (!urlEmployee || !session?.token) return;
    getEmployee(session.token, urlEmployee)
      .then(({ employee }) => { if (active) setEmp(employee); })
      .catch(() => { if (active) setError('Funcionário não localizado na empresa aberta.'); });
    return () => { active = false; };
  }, [urlEmployee, session?.token, session?.company_id]);
  const [revision, setRevision] = useState(0);
  const load = useCallback(() => setRevision(n => n + 1), []);
  useEffect(() => {
    let current = true;
    setRecords([]); setSchedule(null); setAudit(null); setError('');
    if (emp && month) rh(session, 'time', { employee_id: emp.id, competence: month })
      .then(r => { if (current) { setRecords(r.items); setSchedule(r.schedule); setAudit(r.audit || null); } })
      .catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [emp, month, session, revision]);

  // A apuração vem do servidor: faltas presumidas, pendências, férias e afastamentos.
  const st = audit?.stats;
  const kinds = audit
    ? Object.fromEntries(audit.days
      .filter((day) => !['presenca', 'folga'].includes(day.kind))
      .map((day) => [day.date, day.kind]))
    : {};
  const cards = [
    ['Horas trabalhadas', st && records.length ? `${fmtMin(st.worked)}h` : '—'],
    ['Dias sem marcação', st?.absences ?? '—'],
    ['Pendências de ponto', st?.pending ?? '—'],
    ['Atrasos', st && records.length ? `${fmtMin(st.late)}h` : '—'],
    ['Horas extras', st && records.length ? `${fmtMin(st.overtime)}h` : '—'],
  ];

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
          <div className="grid grid-cols-2 gap-px border border-border bg-border md:grid-cols-5">
            {cards.map(([k, v]) => (
              <div key={k} className="bg-card px-4 py-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</p><p className="font-mono text-2xl font-semibold">{v}</p></div>
            ))}
          </div>
          {!schedule && <p className="text-sm text-destructive">Este funcionário não possui jornada vinculada; atrasos, extras e faltas não podem ser calculados.</p>}
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <TimeMarkForm employeeId={emp.id} existing={records} onSaved={load} />
              <Button variant="outline" asChild>
                <Link to={`/frequencia?employee=${encodeURIComponent(emp.id)}&competence=${encodeURIComponent(month)}`}>Conferência de frequência</Link>
              </Button>
            </div>
          )}
          {records.length === 0 && Object.keys(kinds).length === 0 ? <Empty>Nenhuma marcação encontrada no período.</Empty> : (
            <TimeTable days={groupByDay(records)} kinds={kinds} schedule={schedule} employeeId={emp.id} canCorrect={isAdmin} />
          )}
        </>
      )}
    </div>
  );
}