import { useState } from 'react';
import { useSession } from '@/lib/SessionContext';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { fmtDate } from '@/lib/format';
import { STATUS_LABEL } from '@/components/payroll/PayrollSheet';

export default function PayrollActions({ payroll: p, onChange }) {
  const [by, setBy] = useState(p.reviewed_by || '');
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const { session } = useSession();
  const [error, setError] = useState('');
  const inconsistent = Math.abs(p.net_salary - (p.total_earnings - p.total_deductions)) > 0.005;

  const run = async (action, msg) => {
    setBusy(true);
    setError('');
    try {
      const response = await base44.functions.invoke('payrollService', {
        action,
        token: session?.token,
        payroll_id: p.id,
        ...(action === 'approve' ? { reviewer: by.trim() } : {}),
      });
      if (!response.data?.ok || !response.data?.payroll) throw new Error('resposta_invalida');
      onChange(response.data.payroll);
      toast({ title: msg });
    } catch {
      setError('Não foi possível alterar a situação da folha. Confirme os dados e tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border border-border bg-card px-4 py-3 print:hidden">
      <span className="text-sm">Situação: <strong>{STATUS_LABEL[p.status]}</strong></span>
      {p.status === 'rascunho' && (
        <>
          <Input className="max-w-xs" placeholder="Responsável pela conferência" value={by} onChange={(e) => setBy(e.target.value)} />
          <Button disabled={busy || !by.trim() || inconsistent}
            onClick={() => run('approve', 'Folha conferida e aprovada')}>
            Aprovar folha
          </Button>
        </>
      )}
      {p.status === 'aprovada' && (
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