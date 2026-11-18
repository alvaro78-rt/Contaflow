import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import EmployeePicker from '@/components/EmployeePicker';
import Field from '@/components/Field';
import Empty from '@/components/Empty';
import Payslip from '@/components/payroll/Payslip';
import { currentCompetence } from '@/lib/format';

export default function PayslipLookup({ title }) {
  const [emp, setEmp] = useState(null);
  const [comp, setComp] = useState(currentCompetence());
  const [payroll, setPayroll] = useState(null);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    const r = await base44.entities.Payroll.filter({ employee_id: emp.id, competence: comp }, { limit: 1 });
    setPayroll(r.items[0] || null);
    setSearched(true);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-[1fr_200px_auto] md:items-end print:hidden">
        <Field label="Funcionário"><EmployeePicker value={emp} onChange={(e) => { setEmp(e); setSearched(false); }} /></Field>
        <Field label="Competência"><Input type="month" value={comp} onChange={(e) => { setComp(e.target.value); setSearched(false); }} /></Field>
        <Button disabled={!emp || !comp} onClick={search}>Consultar</Button>
      </div>
      {searched && !payroll && <Empty>Não foi encontrado um registro de folha para este funcionário nesta competência.</Empty>}
      {payroll && <Payslip payroll={payroll} title={title} />}
    </div>
  );
}