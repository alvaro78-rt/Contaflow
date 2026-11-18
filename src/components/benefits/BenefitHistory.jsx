import Empty from '@/components/Empty';
import { money, competenceLabel } from '@/lib/format';

const STATUS_LABEL = {
  programada: 'Programada',
  paga: 'Paga',
  a_pagar: 'A pagar',
  calculada: 'Calculada',
  registrada: 'Registrada',
};

export default function BenefitHistory({ records, empty, reference, showStatus = true, onOpen, onStatus, onDelete }) {
  if (!records.length) return <Empty>{empty}</Empty>;
  return (
    <div className="overflow-x-auto border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2">Competência</th>
            <th className="px-4 py-2">Funcionário</th>
            <th className="px-4 py-2">Referência</th>
            <th className="px-4 py-2 text-right">Líquido</th>
            {showStatus && <th className="px-4 py-2">Situação</th>}
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="border-b border-border/60">
              <td className="px-4 py-2 whitespace-nowrap">{competenceLabel(r.competence)}</td>
              <td className="px-4 py-2 font-medium">{r.employee_name}</td>
              <td className="px-4 py-2 text-xs text-muted-foreground">{reference ? reference(r) : '—'}</td>
              <td className="px-4 py-2 text-right font-mono font-semibold">{money(r.net_salary)}</td>
              {showStatus && <td className="px-4 py-2 text-xs">{STATUS_LABEL[r.status] || '—'}</td>}
              <td className="px-4 py-2 text-right text-xs whitespace-nowrap">
                <button className="text-emerald-700 underline" onClick={() => onOpen(r)}>Recibo</button>
                {showStatus && r.status !== 'paga' && onStatus && (
                  <button className="ml-3 text-emerald-700 underline" onClick={() => onStatus(r)}>Marcar paga</button>
                )}
                {onDelete && <button className="ml-3 text-destructive underline" onClick={() => onDelete(r)}>Excluir</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}