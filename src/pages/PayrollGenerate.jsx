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
import { classifyPayrollRelease } from '@/lib/payrollServiceVersion';
import { describePayrollServerFailure } from '@/lib/payrollFailure';

export default function PayrollGenerate() {
  const [emp, setEmp] = useState(null);
  const [comp, setComp] = useState(() => lastClosedCompetence());
  const [payroll, setPayroll] = useState(null);
  const [message, setMessage] = useState('');
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [checkingServer, setCheckingServer] = useState(false);
  const [serverStatus, setServerStatus] = useState('');
  const { toast } = useToast();

  const { session } = useSession();
  const admissionProblem = emp ? competenceAdmissionProblem(comp, emp.admission_date) : '';
  // Preflight autenticado e SOMENTE leitura. O cálculo não deve ser enviado
  // para um bundle antigo ou desconhecido, evitando alterações incertas.
  const checkBackend = async () => {
    setCheckingServer(true);
    setServerStatus('');
    try {
      const response = await base44.functions.invoke('payrollService', {
        action: 'release', token: session?.token,
      });
      const state = classifyPayrollRelease(response);
      const label = state === 'current'
        ? 'Servidor de folha atualizado e acessível. Verificação sem alteração de dados.'
        : state === 'outdated'
          ? 'Versão antiga do backend detectada. Atualize a função payrollService no Base44 antes de processar.'
          : 'Não foi possível confirmar a versão do backend. Não processe a folha.';
      setServerStatus(label);
      return state === 'current';
    } catch (error) {
      const state = classifyPayrollRelease(null, error);
      const status = error?.response?.status ?? error?.status;
      setServerStatus(state === 'outdated'
        ? 'Backend antigo: a verificação de versão não está disponível. Atualize a função payrollService no Base44.'
        : 'Backend não confirmado (HTTP ' + (Number.isInteger(status) ? status : 'indisponível') + '). Não processe a folha.');
      return false;
    } finally {
      setCheckingServer(false);
    }
  };
  const process = async () => {
    if (!emp || !comp || loading || admissionProblem) return;
    setLoading(true);
    setProblems([]);
    setMessage('');
    setPayroll(null);
    try {
      if (!await checkBackend()) {
        setProblems(['Processamento bloqueado: não foi possível validar a versão da função payrollService. Nenhuma folha foi gerada por esta tentativa.']);
        return;
      }
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
      if (response.data.preview_only) {
        setMessage('Prévia não salva: o sistema não encontrou registros de ponto neste mês. Os valores são estimativas, sem apuração de faltas e extras. A conferência do ponto é necessária para gerar a folha definitiva.');
      } else if (response.data.existing || response.data.existing_final) {
        setMessage('Folha já registrada. Os valores originais foram preservados.');
      } else {
        toast({ title: 'Folha calculada e salva para conferência' });
      }
    } catch (error) {
      const status = error?.response?.status ?? error?.status;
      const data = error?.response?.data ?? error?.data;
      // O código antigo enviava ponto_nao_conferido até sem marcações.
      // Antes de atribuir o erro ao RH, verificamos a versão real do endpoint.
      if (data?.error === 'ponto_nao_conferido') {
        let runtime = 'unknown';
        try {
          const release = await base44.functions.invoke('payrollService', {
            action: 'release', token: session?.token,
          });
          runtime = classifyPayrollRelease(release);
        } catch (probeError) {
          runtime = classifyPayrollRelease(null, probeError);
        }
        setProblems([runtime === 'outdated'
          ? 'A função pública payrollService ainda executa uma versão antiga. O ponto não foi alterado. Confira a publicação ativa no Base44 antes de tentar calcular novamente.'
          : runtime === 'current'
            ? 'O Base44 retornou uma resposta incompatível com a versão atual da função. Pode haver diferentes versões em execução. Encaminhe o erro e a rota ao suporte Base44; não modifique os registros de ponto.'
            : 'O Base44 devolveu ponto_nao_conferido, mas não foi possível identificar a versão do servidor. Confira a publicação de payrollService sem alterar os pontos cadastrados.']);
      } else if (describePayrollServerFailure(data, status)) {
        const diagnostic = describePayrollServerFailure(data, status);
        setProblems([
          diagnostic.message,
          `Diagnóstico técnico: payrollService · HTTP 500 · etapa ${diagnostic.stage}.`,
          'Nenhum dado foi apagado por esta tela. Se a etapa envolver gravação, confira o histórico antes de repetir.',
        ]);
      } else if (Array.isArray(data?.problems) && data.problems.length) {
        setProblems(data.problems);
      } else {
        const messages = {
          historico_sem_empresa: 'O RH precisa conciliar um registro antigo sem vínculo de empresa.',
          folha_aprovada: 'Esta folha já foi aprovada. Não é permitido recalcular sem uma revisão autorizada.',
          folhas_duplicadas: 'Existem folhas duplicadas para esta competência. Solicite revisão antes de continuar.',
          competencia_anterior_admissao: 'A folha não pode ser gerada antes da data de admissão. Confira o mês da competência e o cadastro do funcionário.',
          admissao_no_mes: 'A admissão ocorreu dentro da competência. Confira o cálculo proporcional no rascunho.',
          funcionario_desligado: 'O funcionário está desligado. Não é possível gerar esta folha por este fluxo.',
          ponto_nao_conferido: 'O Base44 informou ponto não conferido. Confira se a função payrollService foi publicada na versão atual e se os registros da competência estão cadastrados.',
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
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <Button size="sm" variant="outline" type="button" disabled={loading || checkingServer} onClick={checkBackend}>
          {checkingServer ? 'Verificando servidor…' : 'Verificar backend (sem gravar)'}
        </Button>
        <p role="status" className="text-xs text-muted-foreground">{serverStatus || 'Confirme a versão ativa do processamento antes de gerar a folha.'}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_200px_auto] md:items-end">
        <Field label="Funcionário"><EmployeePicker value={emp} onChange={(e) => { setEmp(e); if (e) setComp((old) => suggestedCompetence(old, e.admission_date)); setPayroll(null); setProblems([]); }} /></Field>
        <Field label="Competência"><Input type="month" value={comp} onChange={(e) => { setComp(e.target.value); setPayroll(null); setProblems([]); }} /></Field>
        <Button disabled={!emp || !comp || loading || checkingServer || Boolean(admissionProblem)} onClick={process}>{loading ? 'Processando…' : 'Processar folha'}</Button>
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
          {!payroll.preview_only && <PayrollActions key={payroll.id + payroll.status} payroll={payroll} onChange={setPayroll} />}
          <PayrollSheet payroll={payroll} />
        </div>
      )}
    </div>
  );
}