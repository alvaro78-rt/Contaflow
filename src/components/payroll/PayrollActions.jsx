import { useState } from 'react';
import { useSession } from '@/lib/SessionContext';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { fmtDate } from '@/lib/format';
import { STATUS_LABEL } from '@/components/payroll/PayrollSheet';
import { EXPECTED_PAYROLL_RELEASE, classifyPayrollRelease } from '@/lib/payrollServiceVersion';

export default function PayrollActions({ payroll: p, onChange }) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const { session } = useSession();
  const [error, setError] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const needsPaymentDate = p.input_review?.version === 2 && p.input_review?.payment_date_confirmed !== true;
  const inconsistent = Math.abs(p.net_salary - (p.total_earnings - p.total_deductions)) > 0.005;

  const run = async (action, msg) => {
    setBusy(true);
    setError('');
    try {
      // Approval, payment-date confirmation and finalization are also financial
      // mutations: never send them to an unverified/older payroll function.
      const release = await base44.functions.invoke('payrollService', {
        action: 'release', token: session?.token,
      });
      if (classifyPayrollRelease(release) !== 'current') {
        setError('A versão do serviço de folha não pôde ser confirmada. Nenhuma alteração foi realizada.');
        return;
      }
      const response = await base44.functions.invoke('payrollService', {
        action,
        expected_release: EXPECTED_PAYROLL_RELEASE,
        token: session?.token,
        payroll_id: p.id,
        expected_company_id: session.company_id,
        ...(action === 'confirmPaymentDate' && { payment_date: paymentDate }),
      });
      if (!response.data?.ok || !response.data?.payroll) throw new Error('resposta_invalida');
      onChange(response.data.payroll);
      toast({ title: msg });
    } catch (e) {
      const problems = (e.data || e.response?.data)?.problems;
      setError(problems?.join(' ') || 'Não foi possível alterar a situação da folha. Confirme os dados e tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border border-border bg-card px-4 py-3 print:hidden">
      <span className="text-sm">Situação: <strong>{STATUS_LABEL[p.status]}</strong></span>
      {session?.role !== 'gerente' && p.status === 'rascunho' && (
        <>
          <span>Conferente: {session?.name}</span>
          {needsPaymentDate ? (
            <>
              <label className="text-sm">
                Data de pagamento para calcular o IRRF
                <Input type="date" value={paymentDate} disabled={busy}
                  onChange={(event) => setPaymentDate(event.target.value)} />
              </label>
              <Button disabled={busy || !paymentDate}
                onClick={() => run('confirmPaymentDate', 'Rascunho atualizado. Confira os valores antes de aprovar.')}>
                Recalcular com a data de pagamento
              </Button>
            </>
          ) : (
            <Button disabled={busy || inconsistent}
              onClick={() => run('approve', 'Folha conferida e aprovada')}>
              Aprovar folha
            </Button>
          )}
        </>
      )}
      {session?.role !== 'gerente' && p.status === 'aprovada' && (
        <>
          <span className="text-sm text-muted-foreground">Conferida por {p.reviewed_by}</span>
          <Button disabled={busy} onClick={() => run('finalize', 'Folha finalizada')}>
            Finalizar folha
          </Button>
        </>
      )}
      {error && <p role="alert" className="w-full text-sm text-destructive">{error}</p>}
      {p.status === 'finalizada' && (
        <span className="text-sm text-muted-foreground">Conferida por {p.reviewed_by} · finalizada em {fmtDate((p.finalized_at || '').slice(0, 10))}</span>
      )}
    </div>
  );
}
