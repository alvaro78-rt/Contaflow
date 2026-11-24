import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getEmployee } from '@/api/employeeAdmin';
import { useSession } from '@/lib/SessionContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PageHeader from '@/components/PageHeader';
import Field from '@/components/Field';
import EmployeePicker from '@/components/EmployeePicker';
import ConferenceSummary from '@/components/attendance/ConferenceSummary';
import ConferenceStatus from '@/components/attendance/ConferenceStatus';
import ConferenceForm from '@/components/attendance/ConferenceForm';
import useConference from '@/hooks/useConference';
import { lastClosedCompetence, suggestedCompetence } from '@/lib/payrollPreflight';
import { uploadEvidence } from '@/lib/evidence';

export default function AttendanceConference() {
  const { session } = useSession();
  const [params] = useSearchParams();
  const presetEmployee = params.get('employee');
  const presetCompetence = params.get('competence');
  const [emp, setEmp] = useState(null);
  const [comp, setComp] = useState(() => presetCompetence || lastClosedCompetence());
  const [confirmed, setConfirmed] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const conf = useConference(emp, comp);
  const authorized = conf.data?.conference?.status === 'autorizada';

  useEffect(() => {
    if (!presetEmployee || !session?.token) return undefined;
    let active = true;
    getEmployee(session.token, presetEmployee)
      .then((result) => { if (active && result.employee) setEmp(result.employee); })
      .catch(() => null);
    return () => { active = false; };
  }, [presetEmployee, session?.token]);

  const upload = async (file) => {
    setUploadError('');
    try {
      return { file_uri: await uploadEvidence(file), name: file.name };
    } catch {
      setUploadError('Não foi possível anexar o arquivo. Tente novamente.');
      return null;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        code="RF12"
        title="Conferência de frequência"
        description="O mês já chega apurado: presenças, atrasos, horas extras, faltas presumidas, férias e pendências são calculados pelas marcações e pela jornada cadastrada. O RH confere as faltas presumidas, anexa justificativas e autoriza a apuração usada na folha."
      />
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_200px] md:items-end">
        <Field label="Funcionário">
          <EmployeePicker
            value={emp}
            onChange={(value) => {
              setEmp(value);
              setConfirmed(false);
              if (value) setComp((old) => suggestedCompetence(old, value.admission_date));
            }}
          />
        </Field>
        <Field label="Competência" className="min-w-0">
          <Input
            type="month"
            value={comp}
            onChange={(event) => { setComp(event.target.value); setConfirmed(false); }}
            className="block w-full min-w-0 max-w-full"
          />
        </Field>
      </div>
      {conf.error && (
        <p role="alert" className="border border-destructive bg-red-50 px-4 py-3 text-sm text-destructive">
          {conf.error}
        </p>
      )}
      {uploadError && <p role="alert" className="text-sm text-destructive">{uploadError}</p>}
      {conf.message && <p className="text-sm text-emerald-700">{conf.message}</p>}
      {conf.loading && <p className="text-sm text-muted-foreground">Carregando a competência…</p>}
      {conf.data && !conf.data.schedule && (
        <p className="border border-amber-600 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Defina a jornada de trabalho do funcionário no cadastro antes de conferir a frequência.
        </p>
      )}
      {conf.data?.schedule && (
        <>
          {!conf.data.closed && (
            <p className="border border-amber-600 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              A competência ainda não terminou. Selecione um mês encerrado para conferir a frequência.
            </p>
          )}
          <ConferenceSummary days={conf.days} counts={conf.data.counts} stats={conf.data.stats} />
          <ConferenceStatus
            conference={conf.data.conference}
            canRevoke={conf.data.can_revoke}
            busy={conf.busy}
            onRevoke={conf.revoke}
          />
          {conf.data.problems?.length > 0 && (
            <ul className="border border-amber-600 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {conf.data.problems.map((problem) => <li key={problem}>• {problem}</li>)}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            O mês chega apurado automaticamente com {conf.data.marks_count} marcação(ões) no período.
            Você só decide sobre as faltas presumidas e autoriza a apuração — nada é lançado dia a dia.
          </p>
          <ConferenceForm
            data={conf.data}
            days={conf.days}
            basis={conf.basis}
            onBasis={conf.setBasis}
            evidence={conf.evidence}
            onEvidence={conf.setEvidence}
            disabled={authorized || !conf.data.closed}
            busy={conf.busy}
            canAuthorize={conf.data.can_authorize}
            confirmed={confirmed}
            onConfirmed={setConfirmed}
            onChangeDay={conf.setDay}
            onUploadDay={(date, file) => upload(file).then((saved) =>
              saved && conf.setDay(date, { evidence_uri: saved.file_uri, evidence_name: saved.name }))}
            onUploadGeneral={(file) => upload(file).then((saved) =>
              saved && conf.setEvidence({ uri: saved.file_uri, name: saved.name }))}
            onSave={conf.save}
            onAuthorize={conf.authorize}
          />
          {authorized && emp && (
            <Button variant="outline" asChild>
              <Link to={`/folha?employee=${encodeURIComponent(emp.id)}&competence=${encodeURIComponent(comp)}`}>
                Processar a folha desta competência
              </Link>
            </Button>
          )}
        </>
      )}
    </div>
  );
}
