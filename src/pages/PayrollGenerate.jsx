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
import { lastClosedCompetence, suggestedCompetence, competenceAdmissionProblem } from '@/lib/payrollPreflight';

export default function PayrollGenerate() {
  const [emp, setEmp] = useState(null);
  const [comp, setComp] = useState(() => lastClosedCompetence());
  const [payroll, setPayroll] = useState(null);
  const [message, setMessage] = useState('');
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const { session } = useSession();
  const admissionProblem = emp ? competenceAdmissionProblem(comp, emp.admission_date) : '';
  const process = async () => {
    if (!emp || !comp || loading || admissionProblem) return;
    setLoading(true);
    setProblems([]);
    setMessage('');
    setPayroll(null);
    try {
      // Calculation and write are carried out in a validated Base44 function.
      const response = await base44.functions.invoke('payrollService', {
        action: 'calculate',
        automatic: true,
        expected_company_id: session?.company_id,
        token: session?.token,
        employee_id: emp.id,
        competence: comp,
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
          competencia_anterior_admissao: 'A folha não pode ser gerada antes da data de admissão. Confira o mês da competência e o cadastro do funcionário.',
          admissao_no_mes: 'A admissão ocorreu dentro da competência. Confira o cálculo proporcional no rascunho.',
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
      <PageHeader code="RF10 · RF12 · RF16" title="Folha de pagamento" description="Selecione o funcionário e processe a competência. O sistema consulta o cadastro, o ponto, as rubricas e a tabela legal; eventuais pendências aparecem abaixo." />
      <div className="grid gap-4 md:grid-cols-[1fr_200px_auto] md:items-end">
        <Field label="Funcionário"><EmployeePicker value={emp} onChange={(e) => { setEmp(e); if (e) setComp((old) => suggestedCompetence(old, e.admission_date)); setPayroll(null); setProblems([]); }} /></Field>
        <Field label="Competência"><Input type="month" value={comp} onChange={(e) => { setComp(e.target.value); setPayroll(null); setProblems([]); }} /></Field>
        <Button disabled={!emp || !comp || loading || Boolean(admissionProblem)} onClick={process}>{loading ? 'Processando…' : 'Processar folha'}</Button>
      </div>
      {admissionProblem && <p role="alert" className="text-sm text-destructive">{admissionProblem}</p>}
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