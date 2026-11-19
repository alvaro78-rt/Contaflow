import { useState } from 'react';
import { useSession } from '@/lib/SessionContext';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/PageHeader';
import Field from '@/components/Field';
import EmployeePicker from '@/components/EmployeePicker';
import PayrollSheet from '@/components/payroll/PayrollSheet';
import PayrollActions from '@/components/payroll/PayrollActions';
import { competenceLabel } from '@/lib/format';
import { lastClosedCompetence, payrollFormProblems } from '@/lib/payrollPreflight';

export default function PayrollGenerate() {
  const [emp, setEmp] = useState(null);
  const [comp, setComp] = useState(() => lastClosedCompetence());
  const [payroll, setPayroll] = useState(null);
  const [payment, setPayment] = useState('');
  const [dependents, setDependents] = useState('');
  const [paidDays, setPaidDays] = useState('');
  const [unpaidDays, setUnpaidDays] = useState('');
  const [dsrExtra, setDsrExtra] = useState('');
  const [dsrDiscount, setDsrDiscount] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [message, setMessage] = useState('');
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const { session } = useSession();
  const resetReview = () => {
    setPayment(''); setDependents(''); setPaidDays(''); setUnpaidDays('');
    setDsrExtra(''); setDsrDiscount(''); setReviewed(false);
  };
  const process = async () => {
    if (!emp || !comp || loading) return;
    const issues = payrollFormProblems({
      competence: comp, paymentDate: payment, taxDependents: dependents,
      dsrExtra, dsrDiscount, reviewedInputs: reviewed,
    });
    if (issues.length) {
      setProblems(issues);
      setMessage('');
      setPayroll(null);
      return;
    }
    setLoading(true);
    setProblems([]);
    setMessage('');
    setPayroll(null);
    try {
      // Calculation and write are carried out in a validated Base44 function.
      const response = await base44.functions.invoke('payrollService', {
        action: 'calculate', expected_company_id: session.company_id, payment_date: payment,
        tax_dependents: dependents === '' ? null : Number(dependents), reviewed_inputs: reviewed,
        unpaid_days: unpaidDays.split(/[,\s]+/).filter(Boolean),
        dsr_extra: dsrExtra === '' ? null : Number(dsrExtra), dsr_discount: dsrDiscount === '' ? null : Number(dsrDiscount),
        paid_days: paidDays.split(/[,\s]+/).filter(Boolean), token: session?.token, employee_id: emp.id, competence: comp,
      });
      if (!response.data?.ok || !response.data?.payroll) throw new Error('resposta_invalida');
      setPayroll(response.data.payroll);
      if (response.data.existing || response.data.existing_final) {
        setMessage('Folha já registrada. Os valores originais foram preservados.');
      } else {
        toast({ title: 'Folha calculada e salva para conferência' });
      }
    } catch (error) {
      const status = error?.response?.status ?? error?.status;
      const data = error?.response?.data ?? error?.data;
      if (Array.isArray(data?.problems) && data.problems.length) {
        setProblems(data.problems);
      } else {
        const messages = {
          historico_sem_empresa: 'O RH precisa conciliar um registro antigo sem vínculo de empresa.',
          folha_aprovada: 'Esta folha já foi aprovada. Não é permitido recalcular sem uma revisão autorizada.',
          folhas_duplicadas: 'Existem folhas duplicadas para esta competência. Solicite revisão antes de continuar.',
          competencia_anterior_admissao: 'A competência selecionada é anterior à admissão do funcionário.',
          funcionario_desligado: 'O funcionário está desligado. Não é possível gerar esta folha por este fluxo.',
          ponto_nao_conferido: 'Não há registros de ponto nesta competência. Confira o período antes de calcular faltas e remuneração.',
          limite_consulta: 'Há muitos registros para esta consulta. A folha não foi calculada para evitar dados incompletos.',
          salvamento_nao_confirmado: 'O servidor não confirmou o salvamento. Confira o histórico antes de tentar novamente.',
          empresa_alterada: 'A empresa aberta mudou. Volte à lista de empresas e entre novamente.',
          sem_empresa: 'Entre em uma empresa antes de processar a folha.',
          operacao_em_andamento: 'Outra operação deste funcionário está em andamento. Atualize e confira antes de tentar novamente.',
          sessao_expirada: 'Sua sessão expirou. Saia e entre novamente com CPF e senha.',
          tabela_legal_incompleta: 'A tabela legal vigente está incompleta. Confira as faixas de INSS e IRRF.',
          situacao_invalida: 'Esta folha está em outra situação. Consulte as folhas anteriores antes de continuar.',
        };
        setProblems([messages[data?.error] || (
          status === 404 ? 'Serviço de folha não encontrado. Publique a função payrollService no Base44 e atualize a versão de produção.'
          : status === 401 || status === 403 ? 'Sessão sem permissão para processar esta folha. Entre novamente ou confira o perfil do usuário.'
          : 'Não foi possível processar a folha (HTTP ' + (status || 'sem resposta') +
            ', código ' + (data?.error || 'não informado') +
            '). Verifique a função payrollService no Base44.'
        )]);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader code="RF10 · RF12 · RF16" title="Folha de pagamento" description="Selecione a competência e o funcionário. INSS, IRRF e FGTS são calculados pela tabela legal vigente e a folha passa por conferência antes de ser finalizada." />
      <div className="border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <p>Competência encerrada mais recente: <strong>{competenceLabel(lastClosedCompetence())}</strong>.
          Para processar uma folha, confira os registros de ponto e as ausências do mês, selecione uma
          data de pagamento, informe dependentes fiscais e os dois valores de DSR (use 0 quando não houver).
          Depois marque a confirmação de conferência. A aprovação e a finalização são etapas separadas.</p>
        {comp > lastClosedCompetence() && (
          <p role="alert" className="mt-2 text-destructive">
            A competência selecionada ainda está aberta. Não é permitido gerar folha mensal definitiva de um mês não encerrado.
          </p>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_200px_auto] md:items-end">
        <Field label="Funcionário"><EmployeePicker value={emp} onChange={(e) => { setEmp(e); resetReview(); setPayroll(null); setProblems([]); }} /></Field>
        <Field label="Competência"><Input type="month" value={comp} onChange={(e) => { setComp(e.target.value); resetReview(); setPayroll(null); setProblems([]); }} /></Field>
        <Button disabled={!emp || !comp || loading} onClick={process}>{loading ? 'Processando…' : 'Processar folha'}</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Data do pagamento"><Input type="date" value={payment} onChange={e => {setPayment(e.target.value); setReviewed(false);}} /></Field>
        <Field label="Dependentes fiscais confirmados"><Input type="number" min="0" max="99" value={dependents} onChange={e => {setDependents(e.target.value); setReviewed(false);}} /></Field>
        <Field label="Feriados e folgas remuneradas sem ponto (AAAA-MM-DD, separados por vírgula)"><Input value={paidDays} onChange={e => {setPaidDays(e.target.value); setReviewed(false);}} /></Field>
        <Field label="Faltas descontáveis confirmadas (AAAA-MM-DD, separadas por vírgula)"><Input value={unpaidDays} onChange={e => {setUnpaidDays(e.target.value);setReviewed(false);}} /></Field>
        <Field label="Reflexo de horas extras no DSR (R$, inclusive zero)"><Input type="number" min="0" step=".01" value={dsrExtra} onChange={e => {setDsrExtra(e.target.value);setReviewed(false);}} /></Field>
        <Field label="Desconto de DSR (R$, inclusive zero)"><Input type="number" min="0" step=".01" value={dsrDiscount} onChange={e => {setDsrDiscount(e.target.value);setReviewed(false);}} /></Field>
        <label><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} /> Conferi ponto, salário e rubricas da competência. É uma folha mensal integral, com um vínculo, sem outros pagamentos tributáveis no mês, compensação de horas, trabalho em feriados, férias, afastamentos, deduções adicionais ou verbas pendentes.</label>
      </div>
      {problems.length > 0 && (
        <ul className="border border-destructive bg-red-50 px-4 py-3 text-sm text-destructive">
          {problems.map((p) => <li key={p}>• {p}</li>)}
        </ul>
      )}
      {message && <p className="text-sm text-amber-700">{message}</p>}
      {payroll && (
        <div className="space-y-4">
          <PayrollActions key={payroll.id + payroll.status} payroll={payroll} onChange={setPayroll} />
          <PayrollSheet payroll={payroll} />
        </div>
      )}
    </div>
  );
}