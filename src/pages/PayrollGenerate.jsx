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
import { currentCompetence } from '@/lib/format';

export default function PayrollGenerate() {
  const [emp, setEmp] = useState(null);
  const [comp, setComp] = useState(currentCompetence());
  const [payroll, setPayroll] = useState(null);
  const [message, setMessage] = useState('');
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const { session } = useSession();
  const process = async () => {
    if (!emp || !comp || loading) return;
    setLoading(true);
    setProblems([]);
    setMessage('');
    setPayroll(null);
    try {
      // Calculation and write are carried out in a validated Base44 function.
      const response = await base44.functions.invoke('payrollService', {
        action: 'calculate', token: session?.token, employee_id: emp.id, competence: comp,
      });
      if (!response.data?.ok || !response.data?.payroll) throw new Error('resposta_invalida');
      setPayroll(response.data.payroll);
      if (response.data.existing_final) {
        setMessage('Esta folha já foi finalizada e não pode ser recalculada.');
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
          folha_aprovada: 'Esta folha já foi aprovada. Não é permitido recalcular sem uma revisão autorizada.',
          folhas_duplicadas: 'Existem folhas duplicadas para esta competência. Solicite revisão antes de continuar.',
          competencia_anterior_admissao: 'A competência selecionada é anterior à admissão do funcionário.',
          funcionario_desligado: 'O funcionário está desligado. Não é possível gerar esta folha por este fluxo.',
          tabela_legal_incompleta: 'A tabela legal vigente está incompleta. Confira as faixas de INSS e IRRF.',
          ponto_nao_conferido: 'Não há registros de ponto nesta competência. Confira o período antes de calcular faltas e remuneração.',
          limite_consulta: 'Há muitos registros para esta consulta. A folha não foi calculada para evitar dados incompletos.',
          salvamento_nao_confirmado: 'O servidor não confirmou o salvamento. Confira o histórico antes de tentar novamente.',
        };
        setProblems([messages[data?.error] || (
          status === 404 ? 'Serviço de folha não encontrado. Publique a função payrollService no Base44 e atualize a versão de produção.'
          : status === 401 || status === 403 ? 'Sessão sem permissão para processar esta folha.'
          : 'Não foi possível processar a folha. Consulte a resposta da função payrollService no servidor.'
        )]);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader code="RF10 · RF12 · RF16" title="Folha de pagamento" description="Selecione a competência e o funcionário. INSS, IRRF e FGTS são calculados pela tabela legal vigente e a folha passa por conferência antes de ser finalizada." />
      <div className="grid gap-4 md:grid-cols-[1fr_200px_auto] md:items-end">
        <Field label="Funcionário"><EmployeePicker value={emp} onChange={(e) => { setEmp(e); setPayroll(null); setProblems([]); }} /></Field>
        <Field label="Competência"><Input type="month" value={comp} onChange={(e) => { setComp(e.target.value); setPayroll(null); setProblems([]); }} /></Field>
        <Button disabled={!emp || !comp || loading} onClick={process}>{loading ? 'Processando…' : 'Processar folha'}</Button>
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