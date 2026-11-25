import { fmtMin } from '@/lib/payroll';

export default function ConferenceSummary({ days, counts, stats }) {
  const list = days || [];
  const map = counts || {};
  const totals = stats || {};
  const decisions = (situation) => list.filter((day) => day.situation === situation).length;
  const presumed = map.falta_presumida || 0;
  const confirmed = decisions('falta_injustificada');
  const items = [
    ['Presenças', map.presenca || 0],
    ['Dias sem marcação', presumed],
    ['Justificadas', decisions('falta_justificada') + decisions('afastamento')],
    ['Faltas confirmadas', confirmed],
    ['Pendências', map.pendencia || 0],
    ['Horas trabalhadas', `${fmtMin(totals.worked || 0)}h`],
  ];
  return (
    <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
      {items.map(([label, value]) => (
        <div key={label} className="bg-card px-4 py-3">
          <p className="font-mono text-xl font-semibold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      ))}
    </div>
  );
}