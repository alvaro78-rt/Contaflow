import { FileDown, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { money, competenceLabel, formatCpf } from '@/lib/format';
import { downloadPayslipPdf } from '@/lib/payslipPdf';

export default function Payslip({ payroll: p, title = 'Contracheque', note = '' }) {
  const estimated = p?.preview === true || p?.preview_only === true || p?.status === 'previa' || p?.status === 'simulacao';
  const pending = !estimated && ['rascunho', 'aprovada'].includes(p?.status);
  const receiptTitle = estimated || pending ? 'Contracheque' : title;
  const receiptNote = estimated ? 'Cálculo estimado — sem validade financeira.' : pending ? 'Folha ainda não finalizada.' : note;
  if (!Array.isArray(p?.earnings) || !Array.isArray(p?.deductions)) {
    return <p role="alert">As verbas detalhadas deste recibo estão incompletas. Solicite a conferência do histórico ao RH.</p>;
  }
  const rows = Math.max(p.earnings.length, p.deductions.length);
  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2 print:hidden">
        <Button variant="outline" size="sm" onClick={() => downloadPayslipPdf(p, receiptTitle, receiptNote)}><FileDown className="mr-2 h-4 w-4" />Baixar PDF</Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Imprimir</Button>
      </div>
      <div className="border border-primary bg-white p-6">
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <p className="text-lg font-semibold">ContaFlow</p>
            <p className="font-mono text-xs text-muted-foreground">Gestão de pessoas e folha de pagamento</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold uppercase tracking-wide">{receiptTitle}</p>
            <p className="font-mono text-xs">{competenceLabel(p.competence)}</p>
          </div>
        </div>
        <div className="grid gap-2 border-b border-border py-4 text-sm sm:grid-cols-3">
          <p><span className="text-muted-foreground">Funcionário:</span> {p.employee_name}</p>
          <p><span className="text-muted-foreground">CPF:</span> <span className="font-mono">{formatCpf(p.employee_cpf)}</span></p>
          <p><span className="text-muted-foreground">Cargo:</span> {p.position_name || '—'}</p>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="py-2">Proventos</th><th className="text-right">Valor</th><th className="pl-6">Descontos</th><th className="text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="py-1.5">{p.earnings[i]?.description}</td>
                <td className="text-right font-mono">{p.earnings[i] ? money(p.earnings[i].value) : ''}</td>
                <td className="pl-6">{p.deductions[i]?.description}</td>
                <td className="text-right font-mono">{p.deductions[i] ? money(p.deductions[i].value) : ''}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-2">Total de proventos</td><td className="text-right font-mono">{money(p.total_earnings)}</td>
              <td className="pl-6">Total de descontos</td><td className="text-right font-mono">{money(p.total_deductions)}</td>
            </tr>
          </tbody>
        </table>
        </div>
        <div className="mt-4 flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
          <span className="text-sm uppercase tracking-wide">{estimated ? 'Líquido estimado' : 'Salário líquido'}</span>
          <span className="font-mono text-xl font-semibold">{money(p.net_salary)}</span>
        </div>
        {(p.informatives || []).map((i, idx) => (
          <p key={idx} className="mt-2 text-xs text-muted-foreground">{i.description}: <span className="font-mono">{money(i.value)}</span></p>
        ))}
        {receiptNote && <p className="mt-4 border-t border-border pt-3 text-[11px] text-muted-foreground">{receiptNote}</p>}
      </div>
    </div>
  );
}
