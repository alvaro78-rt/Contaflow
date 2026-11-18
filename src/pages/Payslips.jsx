import PageHeader from '@/components/PageHeader';
import PayslipLookup from '@/components/payroll/PayslipLookup';

export default function Payslips() {
  return (
    <div>
      <PageHeader code="RF14" title="Contracheques" description="O contracheque reproduz exatamente os valores da folha registrada para a competência." />
      <PayslipLookup title="Contracheque" />
    </div>
  );
}