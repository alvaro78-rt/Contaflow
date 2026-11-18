import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useSession } from '@/lib/SessionContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import EmployeePicker from '@/components/EmployeePicker';
import Field from '@/components/Field';
import Empty from '@/components/Empty';
import Payslip from '@/components/payroll/Payslip';
import { currentCompetence } from '@/lib/format';

export default function PayslipLookup({ title }) {
  const { session } = useSession();
  const own = session?.role === 'funcionario';
  const [emp, setEmp] = useState(null);
  const [comp, setComp] = useState(currentCompetence());
  const [payroll, setPayroll] = useState(null);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const search = async () => {
    if (!comp || (!own && !emp) || loading) return;
    setLoading(true);
    setError('');
    setPayroll(null);
    setSearched(false);
    try {
      const res = own
        ? await base44.functions.invoke('employeePortal', {
            token: session.token, action: 'payslip', competence: comp,
          })
        : await base44.functions.invoke('payrollService', {
            token: session.token, action: 'view', employee_id: emp.id, competence: comp,
          });
      if (!res.data?.ok) throw new Error('resposta_invalida');
      setPayroll(res.data.payroll || null);
      setSearched(true);
    } catch {
      setError('Não foi possível consultar o contracheque. Verifique sua conexão ou tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-[1fr_200px_auto] md:items-end print:hidden">
        {own ? (
          <div className="border border-border bg-card px-4 py-3 text-sm">Seus contracheques finalizados</div>
        ) : (
          <Field label="Funcionário"><EmployeePicker value={emp} onChange={e => { setEmp(e); setSearched(false); setPayroll(null); }} /></Field>
        )}
        <Field label="Competência"><Input type="month" value={comp} onChange={e => { setComp(e.target.value); setSearched(false); setPayroll(null); }} /></Field>
        <Button disabled={loading || !comp || (!own && !emp)} onClick={search}>{loading ? 'Consultando…' : 'Consultar'}</Button>
      </div>
      {error && <p className="border border-destructive p-3 text-sm text-destructive" role="alert">{error}</p>}
      {searched && !payroll && <Empty>{own ? 'Nenhum contracheque finalizado disponível para esta competência.' : 'Não foi encontrada uma folha para esta competência.'}</Empty>}
      {payroll && <Payslip payroll={payroll} title={title} />}
    </div>
  );
}
