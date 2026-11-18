import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageHeader from '@/components/PageHeader';
import ReportPayments from '@/components/reports/ReportPayments';
import ReportTime from '@/components/reports/ReportTime';
import PayslipLookup from '@/components/payroll/PayslipLookup';

export default function Reports() {
  return (
    <div>
      <PageHeader code="RF15" title="Relatórios" description="Pagamento, ponto eletrônico, recibo, resumo da folha e FGTS." />
      <Tabs defaultValue="payments">
        <TabsList className="mb-6 flex h-auto flex-wrap justify-start print:hidden">
          <TabsTrigger value="payments">Pagamento</TabsTrigger>
          <TabsTrigger value="time">Ponto eletrônico</TabsTrigger>
          <TabsTrigger value="receipt">Recibo</TabsTrigger>
          <TabsTrigger value="summary">Resumo da folha</TabsTrigger>
          <TabsTrigger value="fgts">Guia FGTS</TabsTrigger>
        </TabsList>
        <TabsContent value="payments"><ReportPayments mode="payments" /></TabsContent>
        <TabsContent value="time"><ReportTime /></TabsContent>
        <TabsContent value="receipt"><PayslipLookup title="Recibo de pagamento" /></TabsContent>
        <TabsContent value="summary"><ReportPayments mode="summary" /></TabsContent>
        <TabsContent value="fgts"><ReportPayments mode="fgts" /></TabsContent>
      </Tabs>
    </div>
  );
}