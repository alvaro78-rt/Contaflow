import { useState } from 'react';
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
  const inconsistent = Math.abs(p.net_salary - (p.total_earnings - p.total_deductions)) > 0.005;

  const run = async (data, msg) => {
    setBusy(true);
    await base44.entities.Payroll.update(p.id, data);
    onChange({ ...p, ...data });
    toast({ title: msg });
    setBusy(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border border-border bg-card px-4 py-3 print:hidden">
      <span className="text-sm">Situação: <strong>{STATUS_LABEL[p.status]}</strong></span>
      {p.status === 'rascunho' && (
        <>
          <Input className="max-w-xs" placeholder="Responsável pela conferência" value={by} onChange={(e) => setBy(e.target.value)} />
          <Button disabled={busy || !by.trim() || inconsistent}
            onClick={() => run({ status: 'aprovada', reviewed_by: by.trim(), reviewed_at: new Date().toISOString() }, 'Folha conferida e aprovada')}>
            Aprovar folha
          </Button>
        </>
      )}
      {p.status === 'aprovada' && (
        <>
          <span className="text-sm text-muted-foreground">Conferida por {p.reviewed_by}</span>
          <Button disabled={busy} onClick={() => run({ status: 'finalizada', finalized_at: new Date().toISOString() }, 'Folha finalizada')}>
            Finalizar folha
          </Button>
        </>
      )}
      {p.status === 'finalizada' && (
        <span className="text-sm text-muted-foreground">Conferida por {p.reviewed_by} · finalizada em {fmtDate((p.finalized_at || '').slice(0, 10))}</span>
      )}
    </div>
  );
}