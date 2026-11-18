import { jsPDF } from 'jspdf';
import { money, competenceLabel, formatCpf } from '@/lib/format';

const cut = (text, size) => String(text || '').slice(0, size);

// Gera o PDF do contracheque/recibo sem depender da impressão do navegador.
export function downloadPayslipPdf(p, title = 'Contracheque') {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const width = pdf.internal.pageSize.getWidth();
  const right = width - 40;
  let y = 56;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text('Folha/Ledger', 40, y);
  pdf.setFontSize(11);
  pdf.text(title, right, y - 10, { align: 'right' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text(competenceLabel(p.competence), right, y + 2, { align: 'right' });

  y += 22;
  pdf.line(40, y, right, y);
  y += 18;
  pdf.text(`Funcionário: ${p.employee_name || ''}`, 40, y);
  pdf.text(`CPF: ${formatCpf(p.employee_cpf)}`, right, y, { align: 'right' });
  y += 15;
  pdf.text(`Cargo: ${p.position_name || '—'}`, 40, y);
  pdf.text(`Departamento: ${p.department || '—'}`, right, y, { align: 'right' });

  y += 18;
  pdf.line(40, y, right, y);
  y += 16;
  pdf.setFont('helvetica', 'bold');
  pdf.text('Proventos', 40, y);
  pdf.text('Valor', 268, y, { align: 'right' });
  pdf.text('Descontos', 300, y);
  pdf.text('Valor', right, y, { align: 'right' });
  pdf.setFont('helvetica', 'normal');

  const rows = Math.max((p.earnings || []).length, (p.deductions || []).length);
  for (let i = 0; i < rows; i += 1) {
    y += 14;
    if (y > 740) { pdf.addPage(); y = 60; }
    const earning = p.earnings?.[i];
    const deduction = p.deductions?.[i];
    if (earning) {
      pdf.text(cut(earning.description, 30), 40, y);
      pdf.text(money(earning.value), 268, y, { align: 'right' });
    }
    if (deduction) {
      pdf.text(cut(deduction.description, 26), 300, y);
      pdf.text(money(deduction.value), right, y, { align: 'right' });
    }
  }

  y += 18;
  pdf.line(40, y, right, y);
  y += 16;
  pdf.setFont('helvetica', 'bold');
  pdf.text('Total de proventos', 40, y);
  pdf.text(money(p.total_earnings), 268, y, { align: 'right' });
  pdf.text('Total de descontos', 300, y);
  pdf.text(money(p.total_deductions), right, y, { align: 'right' });
  y += 26;
  pdf.rect(40, y - 12, width - 80, 30);
  pdf.setFontSize(12);
  pdf.text('Líquido', 52, y + 6);
  pdf.text(money(p.net_salary), right - 12, y + 6, { align: 'right' });

  y += 40;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  (p.informatives || []).forEach((item) => {
    pdf.text(cut(`${item.description}: ${money(item.value)}`, 110), 40, y);
    y += 12;
  });
  if (p.legal_table_label) pdf.text(`Tabela aplicada: ${p.legal_table_label}`, 40, y + 8);

  const file = `${title}-${p.employee_name || ''}-${p.competence || ''}.pdf`.replace(/[\\/:*?"<>|]/g, '-');
  pdf.save(file);
}