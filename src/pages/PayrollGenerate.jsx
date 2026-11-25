import { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '@/lib/SessionContext';
import { base44 } from '@/api/base44Client';
import { employeeCatalog, getEmployee } from '@/api/employeeAdmin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/PageHeader';
import Field from '@/components/Field';
import EmployeePicker from '@/components/EmployeePicker';
import PayrollActions from '@/components/payroll/PayrollActions';
import { formatCpf, money, competenceLabel } from '@/lib/format';
import Payslip from '@/components/payroll/Payslip';
import { rh } from '@/api/rh';
import { buildContractualPreview } from '@/lib/payrollPreview';
import { lastClosedCompetence } from '@/lib/payrollPreflight';
import { EXPECTED_PAYROLL_RELEASE, classifyPayrollRelease } from '@/lib/payrollServiceVersion';

const ERROR_MESSAGES = {
  historico_sem_empresa: 'O RH precisa conciliar um registro antigo sem vínculo de empresa.',
  folha_aprovada: 'Esta folha já foi aprovada. Não é permitido recalcular sem uma revisão autorizada.',
  folhas_duplicadas: 'Existem folhas duplicadas para esta competência. Solicite revisão antes de continuar.',
  competencia_anterior_admissao: 'A folha não pode ser gerada antes da data de admissão. Confira o mês da competência e o cadastro do funcionário.',
  admissao_no_mes: 'A admissão ocorreu dentro da competência. O fechamento automático exige conferência do cálculo proporcional.',
  funcionario_desligado: 'O funcionário está desligado. Não é possível gerar esta folha por este fluxo.',
  ponto_nao_conferido: 'O ponto da competência não está conferido. Confira os registros do mês antes de gerar a folha.',
  ponto_sem_registros: 'Não existem marcações nesta competência. Confira a frequência antes de gerar a folha oficial.',
  ponto_pendente: 'Há marcações incompletas no período. Corrija o ponto na tela de correção antes de gerar a folha.',
  conferencia_necessaria: 'Revise cada dia sem marcação e autorize a conferência antes de aplicar descontos na folha oficial.',
  conferencia_incompleta: 'A conferência de frequência não está completa: confira as faltas presumidas, as justificativas e as evidências antes de gerar a folha.',
  conferencia_autorizada: 'A conferência desta competência já está autorizada. Ajuste a apuração antes de gerar a folha.',
  conferencia_duplicada: 'Existem conferências duplicadas para esta competência. Solicite revisão antes de continuar.',
  limite_consulta: 'Há muitos registros para esta consulta. A folha não foi calculada para evitar dados incompletos.',
  salvamento_nao_confirmado: 'O servidor não confirmou o salvamento. Confira o histórico antes de tentar novamente.',
  empresa_alterada: 'A empresa aberta mudou. Volte à lista de empresas e entre novamente.',
  sem_empresa: 'Entre em uma empresa antes de processar a folha.',
  operacao_em_andamento: 'Outra operação deste funcionário está em andamento. Aguarde alguns minutos e tente novamente: bloqueios abandonados são liberados automaticamente.',
  sessao_expirada: 'Sua sessão expirou. Saia e entre novamente com CPF e senha.',
  tabela_legal_incompleta: 'A tabela legal vigente está incompleta. Confira as faixas de INSS e IRRF.',
  situacao_invalida: 'Esta folha está em outra situação. Consulte as folhas anteriores antes de continuar.',
  versao_desatualizada: 'O serviço de folha do site publicado está em outra versão. Publique o aplicativo e tente novamente.',
  fechamento_nao_confirmado: 'Confira a data de pagamento e a permissão para fechar a folha.',
  sem_permissao: 'Seu perfil não possui autorização para esta operação.',
};

const FALLBACK_ERROR = 'Não foi possível confirmar o processamento. Confira as folhas anteriores antes de tentar novamente.';

// Recusas por ausência de ponto ou de conferência de frequência: a tela mostra a prévia demonstrativa.
const ATTENDANCE_REFUSALS = ['ponto_sem_registros', 'ponto_pendente', 'ponto_nao_conferido', 'conferencia_necessaria', 'conferencia_incompleta'];

// Busca tabelas pelo serviço autenticado do RH. A consulta direta à entidade LegalTable
// pode ser bloqueada pelo RLS do Base44, fazendo parecer que a tabela não existe.
async function loadPreviewLegalTable(session, competence) {
  const response = await rh(session, 'legalTables');
  if (!Array.isArray(response?.items)) throw new Error('tabelas_indisponiveis');
  const applicable = response.items.filter((table) =>
    table?.active !== false &&
    typeof table.start_competence === 'string' &&
    table.start_competence <= competence &&
    (!table.end_competence || table.end_competence >= competence)
  );
  if (applicable.length === 0) throw new Error('tabela_ausente');
  if (applicable.length > 1) throw new Error('tabelas_sobrepostas');
  return applicable[0];
}

// O servidor pode devolver uma pendência de frequência em problems, com código
// cadastro_incompleto. Essa recusa não deve esconder a prévia já calculada.
function isAttendanceProblem(data) {
  if (ATTENDANCE_REFUSALS.includes(data?.error)) return true;
  return data?.error === 'cadastro_incompleto' &&
    Array.isArray(data?.problems) && data.problems.length > 0 &&
    data.problems.every((problem) =>
      typeof problem === 'string' &&
      /ponto|marca[cç][aãõ]o|marca[cç][oõ]es|frequ[eê]ncia|confer[eê]ncia/i.test(problem)
    );
}

// Relatório individual do RH, separado do contracheque.
export function PayrollDocuments({ payroll, scheduleName, weeklyHours }) {
  const estimated = payroll.preview || payroll.preview_only ||
    ['previa', 'simulacao'].includes(payroll.status);
  const finalized = !estimated && payroll.status === 'finalizada';
  const title = 'Folha de pagamento';
  const state = estimated ? 'Valores estimados — frequência não apurada' :
    finalized ? 'Finalizada' : 'Não finalizada';
  const duration = (n) => {
    const minutes = Math.max(0, Math.round(Number(n) || 0));
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}min`;
  };
  const download = () => {
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const width = pdf.internal.pageSize.getWidth();
    const height = pdf.internal.pageSize.getHeight();
    let y = 44;
    const line = (value, bold = false) => {
      pdf.setFont('helvetica', bold ? 'bold' : 'normal');
      pdf.setFontSize(10);
      for (const text of pdf.splitTextToSize(String(value), width - 80)) {
        if (y > height - 44) { pdf.addPage(); y = 44; }
        pdf.text(text, 40, y);
        y += 15;
      }
    };
    const group = (label, rows) => {
      y += 10;
      line(label, true);
      for (const row of rows || []) line(`${row.description}: ${money(row.value)}`);
    };
    line('ContaFlow | ' + title, true);
    line(state);
    line('Competência: ' + competenceLabel(payroll.competence));
    line('Funcionário: ' + (payroll.employee_name || ''));
    line('CPF: ' + formatCpf(payroll.employee_cpf));
    line('Cargo: ' + (payroll.position_name || '—'));
    line('Salário-base: ' + money(payroll.base_salary));
    line('Jornada de referência: ' + (scheduleName || '—'));
    line('Carga horária semanal de referência: ' + (weeklyHours ?? '—') + ' h');
    const t = payroll.time_summary || {};
    if (estimated || payroll.attendance_pending) {
      line('Frequência: não apurada; valores estimados.');
      if (payroll.scenario) line(`Hipótese informada: ${payroll.scenario.vacationDays} dias de férias; ${payroll.scenario.absences} faltas; ${duration(payroll.scenario.overtimeMinutes)} extras.`);
    } else {
      line(`Frequência: ${duration(t.worked)} trabalhadas; ${t.absences || 0} falta(s)`);
      line(`Atrasos: ${duration(t.late)} | Extras: ${duration(t.overtime)}`);
    }
    if (payroll.calc_memory) {
      const m = payroll.calc_memory;
      line('Tabela legal: ' + (payroll.legal_table_label || '—'));
      line('Base INSS: ' + money(m.inss_base));
      line('Base IRRF: ' + money(m.irrf_base));
      line('Base FGTS: ' + money(m.fgts_base));
    }
    group('Proventos', payroll.earnings);
    line('Total de proventos: ' + money(payroll.total_earnings), true);
    group('Descontos', payroll.deductions);
    line('Total de descontos: ' + money(payroll.total_deductions), true);
    group('Encargos e informativas', payroll.informatives);
    y += 10;
    line((estimated ? 'Líquido estimado: ' : 'Salário líquido: ') + money(payroll.net_salary), true);
    pdf.save(`Folha-${estimated ? 'simulacao-' : ''}${payroll.competence || ''}.pdf`);
  };
  const printSheet = () => {
    document.body.classList.add('cf-print-sheet');
    try { window.print(); }
    finally { document.body.classList.remove('cf-print-sheet'); }
  };
  return (
    <div className="space-y-8">
      <style>{`@media print {
        body:not(.cf-print-sheet) .cf-sheet-section { display: none !important; }
        body.cf-print-sheet .cf-payslip-section { display: none !important; }
        body.cf-print-sheet * { visibility: hidden; }
        body.cf-print-sheet .cf-sheet-section, body.cf-print-sheet .cf-sheet-section * { visibility: visible; }
        body.cf-print-sheet .cf-sheet-section { position: absolute; top: 0; left: 0; width: 100%; }
        body.cf-print-sheet .print\\:hidden { display: none !important; }
      }`}</style>
      <section className="cf-sheet-section space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={download}>Baixar PDF</Button>
            <Button variant="outline" size="sm" onClick={printSheet}>Imprimir</Button>
          </div>
        </div>
        {!estimated && <p className="text-sm text-muted-foreground">{state}</p>}
        {estimated && <p className="text-xs text-muted-foreground">Jornada de referência: {scheduleName || '—'}</p>}
        <div className="space-y-4 border border-border bg-card p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Funcionário', payroll.employee_name || '—'],
              ['CPF', formatCpf(payroll.employee_cpf)],
              ['Competência', competenceLabel(payroll.competence)],
              ['Cargo', payroll.position_name || '—'],
              ['Salário-base contratual', money(payroll.base_salary)],
              ['Carga semanal de referência', weeklyHours == null ? '—' : `${weeklyHours} h`],
            ].map(([label, value]) => (
              <div key={label} className="border border-border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-medium">{value}</p>
              </div>
            ))}
          </div>
          <h3 className="font-semibold">Frequência</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Horas trabalhadas', payroll.time_summary?.worked, true],
              ['Faltas (dias)', payroll.time_summary?.absences, false],
              ['Atrasos', payroll.time_summary?.late, true],
              ['Horas extras', payroll.time_summary?.overtime, true],
            ].map(([label, value, isDuration]) => (
              <div key={label} className="border border-border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-medium">{payroll.scenario && label === 'Faltas (dias)' ? `${payroll.scenario.absences} (estimado)` : payroll.scenario && label === 'Horas extras' ? `${duration(payroll.scenario.overtimeMinutes)} (estimado)` : estimated || payroll.attendance_pending || value == null ? 'Não apurado' : isDuration ? duration(value) : value}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ['Proventos', payroll.earnings, payroll.total_earnings],
              ['Descontos', payroll.deductions, payroll.total_deductions],
            ].map(([label, rows, total]) => (
              <div key={label} className="border border-border">
                <h3 className="border-b bg-secondary/60 px-4 py-2 font-semibold">{label}</h3>
                {(rows || []).map((item, i) => (
                  <div key={i} className="flex justify-between gap-3 border-b border-border/60 px-4 py-2 text-sm">
                    <span>{item.description}</span><span className="whitespace-nowrap font-mono">{money(item.value)}</span>
                  </div>
                ))}
                <div className="flex justify-between gap-3 px-4 py-3 font-semibold"><span>Total</span><span>{money(total)}</span></div>
              </div>
            ))}
          </div>
          <div className="border border-border p-4 space-y-2">
            <h3 className="font-semibold">Encargos e informativas</h3>
            {(payroll.informatives || []).map((item, i) => (
              <div key={i} className="flex justify-between gap-3 text-sm"><span>{item.description}</span><span>{money(item.value)}</span></div>
            ))}
            {payroll.calc_memory && <div className="grid gap-2 border-t pt-3 text-sm sm:grid-cols-3">
              <span>Base INSS: {money(payroll.calc_memory.inss_base)}</span>
              <span>Base IRRF: {money(payroll.calc_memory.irrf_base)}</span>
              <span>Base FGTS: {money(payroll.calc_memory.fgts_base)}</span>
            </div>}
            {payroll.legal_table_label && <p className="text-xs text-muted-foreground">Tabela aplicada: {payroll.legal_table_label}</p>}
          </div>
          <div className="flex justify-between gap-3 bg-primary px-4 py-4 text-primary-foreground font-semibold">
            <span>{estimated ? 'Líquido estimado' : 'Salário líquido'}</span>
            <span className="font-mono text-xl">{money(payroll.net_salary)}</span>
          </div>
        </div>
        {estimated && <p className="text-xs text-muted-foreground">Valores estimados — frequência não apurada.</p>}
      </section>
      <section className="cf-payslip-section space-y-3">
        <h2 className="text-lg font-semibold print:hidden">Contracheque</h2>
        <Payslip payroll={payroll} />
      </section>
    </div>
  );
}

export default function PayrollGenerate() {
  const [emp, setEmp] = useState(null);
  const [comp, setComp] = useState(() => lastClosedCompetence());
  const [detail, setDetail] = useState(null);
  const [catalog, setCatalog] = useState({ positions: [], schedules: [] });
  const [payroll, setPayroll] = useState(null);
  const [preview, setPreview] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [scenarioMode, setScenarioMode] = useState(false);
  const [scenario, setScenario] = useState({ vacationDays: '0', absences: '0', extraHours: '0' });
  const [scenarioContext, setScenarioContext] = useState(null);
  useEffect(() => {
    setScenario({ vacationDays: '0', absences: '0', extraHours: '0' });
    setScenarioMode(false);
    setScenarioContext(null);
  }, [emp?.id, comp]);
  const [message, setMessage] = useState('');
  const [problems, setProblems] = useState([]);
  const [attendancePending, setAttendancePending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const { toast } = useToast();

  const { session } = useSession();
  const [searchParams] = useSearchParams();
  const presetEmployee = searchParams.get('employee');
  const presetCompetence = searchParams.get('competence');
  const employeeInfo = detail || emp;
  const schedule = catalog.schedules.find((row) => row.id === employeeInfo?.schedule_id) || null;
  const positionName = catalog.positions.find((row) => row.id === employeeInfo?.position_id)?.name || '';
  const currentMonth = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Recife', year: 'numeric', month: '2-digit' }).format(new Date());
  const admissionMonth = employeeInfo?.admission_date?.slice(0, 7) || '';
  const admissionProblem = emp && comp && admissionMonth && comp < admissionMonth
    ? 'Selecione uma competência a partir do mês de admissão.' : '';
  const futureProblem = comp > currentMonth ? 'Selecione o mês atual ou um mês anterior.' : '';
  const chooseCompetence = (old, date) => {
    const minimum = date?.slice(0, 7) || '';
    return minimum && old < minimum ? minimum : old;
  };

  // Cargos e jornadas da empresa: usados para identificar o cargo e apurar a prévia pela jornada.
  useEffect(() => {
    if (!session?.token) return undefined;
    let active = true;
    employeeCatalog(session.token)
      .then((result) => {
        if (active) setCatalog({ positions: result.positions || [], schedules: result.schedules || [] });
      })
      .catch(() => {
        if (active) setProblems(['Não foi possível carregar cargos e jornadas desta empresa. Atualize a página e tente novamente.']);
      });
    return () => { active = false; };
  }, [session?.token, session?.company_id]);

  // Vindo da conferência de frequência: abre já com o funcionário e o mês escolhidos.
  useEffect(() => {
    if (presetCompetence) setComp(presetCompetence);
    if (!presetEmployee || !session?.token) return undefined;
    let active = true;
    getEmployee(session.token, presetEmployee)
      .then((result) => { if (active && result.employee) { setEmp(result.employee); setComp(old => chooseCompetence(old, result.employee.admission_date)); } })
      // Funcionário não localizado: o usuário escolhe manualmente no seletor.
      .catch(() => { active = false; });
    return () => { active = false; };
  }, [presetEmployee, presetCompetence, session?.token]);

  // Ao escolher funcionário e competência, carrega o cadastro real e apresenta a folha.
  // Se já existe folha gravada, mostra a folha real; caso contrário, a prévia pela jornada.
  useEffect(() => {
    if (!emp?.id || !comp || !session?.token || futureProblem) { setPreparing(false); setPreview(null); setPayroll(null); setShowPreview(false); return undefined; }
    let active = true;
    setPreparing(true);
    setPayroll(null);
    setPreview(null);
    setShowPreview(false);
    setMessage('');
    setProblems([]);
    setAttendancePending(false);

    const readExisting = async () => {
      try {
        const { data } = await base44.functions.invoke('payrollService', {
          action: 'view', token: session.token, employee_id: emp.id, competence: comp,
        });
        return data?.payroll || null;
      } catch {
        // Leitura opcional: a prévia pela jornada continua válida e a geração mostra o erro real.
        return null;
      }
    };

    (async () => {
      try {
        const [detailResult, existing] = await Promise.all([
          getEmployee(session.token, emp.id),
          readExisting(),
        ]);
        if (!active) return;
        const employee = detailResult?.employee;
        if (!employee) throw new Error('funcionario_ausente');
        setDetail(employee);
        if (employee.admission_date?.slice(0, 7) > comp) {
          setComp(employee.admission_date.slice(0, 7));
          return;
        }
        if (existing) { setPayroll(existing); return; }
        const employeeSchedule = catalog.schedules.find((row) => row.id === employee.schedule_id) || null;
        if (!employeeSchedule) throw new Error('jornada_ausente');
        const [table, attendance] = await Promise.all([
          loadPreviewLegalTable(session, comp),
          base44.functions.invoke('attendanceConference', {
            action: 'view',
            token: session.token,
            expected_company_id: session.company_id,
            employee_id: employee.id,
            competence: comp,
          }).then(
            ({ data }) => data?.ok && !data.duplicates && data.stats && Array.isArray(data.days) ? data : null,
            () => null,
          ),
        ]);
        if (!active) return;
        const context = {
          employee,
          schedule: employeeSchedule,
          positionName: catalog.positions.find((row) => row.id === employee.position_id)?.name || '',
          competence: comp,
          table,
          attendance,
        };
        const calculated = buildContractualPreview(context);
        setScenarioContext(context);
        if (!calculated || !Array.isArray(calculated.earnings) ||
            !Array.isArray(calculated.deductions) ||
            !Number.isFinite(calculated.net_salary)) throw new Error('previa_invalida');
        setPreview(calculated);
      } catch (error) {
        if (!active) return;
        const messages = {
          jornada_ausente: 'Jornada não definida no cadastro do funcionário.',
          tabela_ausente: 'Nenhuma tabela legal vigente encontrada para este mês. Confira Parâmetros Legais.',
          tabelas_sobrepostas: 'Existem tabelas legais sobrepostas para este mês. Corrija a vigência antes de calcular.',
          tabelas_indisponiveis: 'Não foi possível consultar as tabelas legais pelo servidor.',
          funcionario_ausente: 'Funcionário não encontrado nesta empresa.',
          previa_invalida: 'Não foi possível calcular os valores da prévia com os dados cadastrados.',
        };
        setProblems([messages[error?.message] || ERROR_MESSAGES[error?.code] ||
          'Não foi possível preparar a prévia. Confira os dados do cadastro e a conexão.']);
      } finally {
        if (active) setPreparing(false);
      }
    })();

    return () => { active = false; };
  }, [emp?.id, comp, session?.token, session?.company_id, catalog, admissionProblem, futureProblem]);

  // Arquiva somente o cálculo exibido, em entidade separada da folha oficial.
  const archivePreview = async (calculated) => {
    setPreview(calculated);
    setShowPreview(true);
    try {
      const { data } = await base44.functions.invoke('payrollSimulationHistory', {
        action: 'save', token: session.token,
        expected_company_id: session.company_id,
        employee_id: emp.id, competence: comp, snapshot: calculated,
      });
      if (!data?.ok || !data?.record?.id) throw new Error('historico_nao_confirmado');
      setMessage('Estimativa salva em Folhas anteriores.');
    } catch {
      setMessage('Cálculo exibido, mas o histórico não foi confirmado. Clique em Gerar folha para tentar salvar novamente.');
    }
  };

  const process = async () => {
    if (!emp || !comp || loading || preparing || admissionProblem || futureProblem || !session?.token) return;
    if (payroll) return;
    if (scenarioMode) {
      if (!scenarioContext || scenarioContext.employee.id !== emp.id || scenarioContext.competence !== comp) return;
      setLoading(true);
      setMessage('');
      try {
        const calculated = buildContractualPreview({ ...scenarioContext, scenario });
        setProblems([]);
        await archivePreview(calculated);
      } catch (error) {
        setShowPreview(false);
        setProblems([error.message || 'Confira os dados da estimativa.']);
      } finally { setLoading(false); }
      return;
    }
    if (comp === currentMonth) {
      setLoading(true);
      setMessage('');
      try {
        if (scenarioContext) {
          setProblems([]);
          await archivePreview(buildContractualPreview(scenarioContext));
        } else setProblems(['Não foi possível calcular a estimativa. Confira o cadastro, a jornada e a tabela legal.']);
      } catch (error) { setProblems([error.message || 'Não foi possível calcular a estimativa.']); }
      finally { setLoading(false); }
      return;
    }
    setLoading(true);
    setProblems([]);
    setAttendancePending(false);
    setMessage('');
    setShowPreview(false);
    try {
      // A consulta de versão é SOMENTE leitura. Se ela falhar ou retornar uma
      // versão desconhecida, NÃO enviar o cálculo: versões antigas podem ignorar
      // expected_release e gravar uma folha com regras incompatíveis.
      let release;
      try {
        release = await base44.functions.invoke('payrollService', {
          action: 'release', token: session?.token,
        });
      } catch (error) {
        const state = classifyPayrollRelease(null, error);
        setProblems([state === 'outdated'
          ? 'O serviço de folha do site publicado ainda está na versão anterior. Publique o aplicativo para liberar o processamento.'
          : 'Não foi possível confirmar a versão do serviço de folha. Confira sua sessão ou conexão e tente novamente. Nenhuma folha foi processada.']);
        return;
      }
      if (classifyPayrollRelease(release) !== 'current') {
        setProblems([classifyPayrollRelease(release) === 'outdated'
          ? 'O serviço de folha do site publicado ainda está na versão anterior. Publique o aplicativo para liberar o processamento.'
          : 'Não foi possível confirmar a versão do serviço de folha. Nenhuma folha foi processada.']);
        return;
      }
      const response = await base44.functions.invoke('payrollService', {
        action: 'calculate',
        automatic: true,
        expected_release: EXPECTED_PAYROLL_RELEASE,
        expected_company_id: session?.company_id,
        token: session?.token,
        employee_id: emp.id,
        competence: comp,
      });
      if (!response.data?.ok || !response.data?.payroll) throw new Error('resposta_invalida');
      // Nunca exibir uma estimativa como se tivesse sido gravada no banco.
      if (response.data.preview_only || !response.data.payroll.id) {
        setAttendancePending(true);
        if (preview && scenarioContext) {
          await archivePreview(buildContractualPreview(scenarioContext));
        } else {
          setProblems(['O servidor não confirmou uma folha oficial. Confira o ponto ou os dados necessários.']);
        }
        return;
      }
      setPreview(null);
      setPayroll(response.data.payroll);
      if (response.data.existing || response.data.existing_final) {
        setMessage('Folha já registrada. Os valores originais foram preservados.');
      } else {
        setMessage('Folha registrada em Folhas anteriores.');
        toast({ title: response.data.payroll.status === 'finalizada' ? 'Folha finalizada com sucesso' : 'Folha calculada e salva para conferência' });
      }
    } catch (error) {
      const data = error?.response?.data ?? error?.data;
      const attendanceRefusal = isAttendanceProblem(data);
      // A pendência oficial de ponto continua protegida no servidor. Para a
      // apresentação, mostramos somente a prévia local, sem gravar dados.
      if (attendanceRefusal && preview && scenarioContext) {
        setAttendancePending(true);
        await archivePreview(buildContractualPreview(scenarioContext));
        return;
      }
      if (attendanceRefusal) setAttendancePending(true);
      if (Array.isArray(data?.problems) && data.problems.length) {
        setProblems(data.problems);
      } else {
        setProblems([ERROR_MESSAGES[data?.error] || FALLBACK_ERROR]);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader code="RF10 · RF12 · RF16" title="Folha de pagamento" description="Selecione o funcionário e a competência." />
      <fieldset disabled={loading} className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_200px_auto] md:items-end">
        <Field label="Funcionário">
          <EmployeePicker
            value={emp}
            onChange={(value) => {
              setEmp(value);
              setDetail(null);
              setPayroll(null);
              setPreview(null);
              setProblems([]);
              setMessage('');
              setAttendancePending(false);
              if (value) setComp((old) => chooseCompetence(old, value.admission_date));
              setShowPreview(false);
            }}
          />
        </Field>
        <Field label="Competência" className="min-w-0"><Input className="block w-full min-w-0 max-w-full appearance-none box-border [&::-webkit-date-and-time-value]:min-w-0" type="month" min={admissionMonth || undefined} max={currentMonth} value={comp} onChange={(e) => { setPreview(null); setPayroll(null); setShowPreview(false); setProblems([]); setMessage(''); setComp(e.target.value); }} /></Field>
        <Button disabled={!emp || !comp || loading || preparing || Boolean(admissionProblem) || Boolean(futureProblem) || Boolean(payroll)} onClick={process}>{loading ? 'Gerando…' : 'Gerar folha'}</Button>
      </fieldset>
      {employeeInfo && (
        <p className="text-xs text-muted-foreground">
          {employeeInfo.full_name} · {formatCpf(employeeInfo.cpf)} · {positionName || 'Cargo não definido'} ·
          {' '}Salário-base {money(employeeInfo.base_salary)} · Jornada {schedule?.name || 'não definida'}
        </p>
      )}
      {!payroll && emp && <div className="space-y-3 rounded-lg border border-border bg-card p-4 print:hidden">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={scenarioMode} disabled={loading || preparing} onChange={e => { setScenarioMode(e.target.checked); setShowPreview(false); setProblems([]); if (!e.target.checked && scenarioContext) setPreview(buildContractualPreview(scenarioContext)); }} />
          Simular férias, faltas e horas extras
        </label>
        {scenarioMode && <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[[ 'vacationDays', 'Dias de férias', '30', '1'], ['absences', 'Faltas injustificadas (dias)', '31', '1'], ['extraHours', 'Horas extras', '200', '0.25']].map(([key,label,max,step]) => <Field key={key} label={label}><Input type="number" disabled={loading || preparing} min="0" max={max} step={step} value={scenario[key]} onChange={e => { setScenario(old => ({ ...old, [key]: e.target.value })); setShowPreview(false); }} /></Field>)}
          </div>
          <p className="text-xs text-muted-foreground">Estimativa informada manualmente. Não altera ponto, férias ou folhas oficiais. Não inclui médias, DSR nem compensação de férias antecipadas.</p>
        </>}
      </div>}
      {!payroll && emp && comp === currentMonth && !scenarioMode && (
        <p className="text-sm text-muted-foreground">
          Mês em andamento. A prévia considera o salário proporcional aos dias corridos do período e as faltas
          confirmadas na conferência. A folha oficial fica disponível após o encerramento.
        </p>
      )}
      {preparing && <p className="text-sm text-muted-foreground">Carregando cadastro, jornada e tabela legal…</p>}
      {futureProblem && <p role="alert" className="text-sm text-destructive">{futureProblem}</p>}
      {admissionProblem && <p role="alert" className="text-sm text-destructive">{admissionProblem}</p>}
      {problems.length > 0 && (
        <ul className="border border-destructive bg-red-50 px-4 py-3 text-sm text-destructive">
          {problems.map((p) => <li key={p}>• {p}</li>)}
        </ul>
      )}
      {attendancePending && emp && !preview && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to={`/ponto?employee=${encodeURIComponent(emp.id)}&competence=${encodeURIComponent(comp)}`}>Conferir ponto do mês</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/frequencia?employee=${encodeURIComponent(emp.id)}&competence=${encodeURIComponent(comp)}`}>Registrar conferência de frequência</Link>
          </Button>
        </div>
      )}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      {(payroll || (preview && showPreview)) && (session?.master || ['master', 'admin'].includes(session?.role)) && (
        <Button variant="outline" asChild><Link to="/folhas-anteriores">Consultar folhas anteriores</Link></Button>
      )}
      {payroll && (
        <div className="space-y-4">
          {!payroll.preview_only && <PayrollActions key={payroll.id + payroll.status} payroll={payroll} onChange={setPayroll} />}
          <PayrollDocuments payroll={payroll} scheduleName={schedule?.name} weeklyHours={employeeInfo?.weekly_hours ?? schedule?.weekly_hours} />
        </div>
      )}
      {!payroll && preview && showPreview && (
        <div className="space-y-3">
          <PayrollDocuments payroll={preview} scheduleName={schedule?.name} weeklyHours={employeeInfo?.weekly_hours ?? schedule?.weekly_hours} />
          {preview.preview_dependents_unknown && (
            <p className="text-xs text-amber-700">Dependentes fiscais não classificados: simulação sem dedução por dependentes.</p>
          )}
        </div>
      )}
    </div>
  );
}
