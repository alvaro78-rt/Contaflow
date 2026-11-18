import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { fmtDate, WEEKDAYS } from '@/lib/format';
import { dayStats, fmtMin } from '@/lib/payroll';

export const KINDS = [['entry', 'Entrada'], ['break_start', 'Saída intervalo'], ['break_end', 'Volta intervalo'], ['exit', 'Saída']];

function Cell({ rec }) {
  if (!rec) return <span className="text-muted-foreground">—</span>;
  if (!rec.corrected_time) return <span className="font-mono">{rec.original_time}</span>;
  return (
    <span>
      <span className="font-mono text-emerald-700">{rec.corrected_time}</span>
      <span className="block font-mono text-[11px] text-muted-foreground line-through">{rec.original_time}</span>
    </span>
  );
}

export default function TimeTable({ days, absentDates, schedule, employeeId, canCorrect }) {
  const dates = [...new Set([...Object.keys(days), ...absentDates])].sort();
  return (
    <div className="overflow-x-auto border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2">Data</th>
            {KINDS.map(([k, l]) => <th key={k} className="px-4 py-2">{l}</th>)}
            <th className="px-4 py-2">Ocorrências</th><th />
          </tr>
        </thead>
        <tbody>
          {dates.map((d) => {
            const day = days[d];
            const st = day ? dayStats(day, schedule) : null;
            const dow = WEEKDAYS[new Date(`${d}T12:00:00`).getDay()];
            return (
              <tr key={d} className="border-b border-border/60">
                <td className="px-4 py-2 font-mono text-xs">{fmtDate(d)} <span className="text-muted-foreground">{dow}</span></td>
                {KINDS.map(([k]) => <td key={k} className="px-4 py-2"><Cell rec={day?.[k]} /></td>)}
                <td className="space-x-1 px-4 py-2">
                  {!day && <Badge variant="destructive">Sem marcação</Badge>}
                  {st?.late > 0 && <Badge variant="outline" className="border-amber-500 text-amber-700">Atraso {fmtMin(st.late)}</Badge>}
                  {st?.overtime > 0 && <Badge variant="outline" className="border-emerald-600 text-emerald-700">Extra {fmtMin(st.overtime)}</Badge>}
                  {st?.incomplete && <Badge variant="outline">Incompleto</Badge>}
                </td>
                <td className="px-4 py-2 text-right">
                  {day && canCorrect && <Link className="text-xs text-emerald-700 underline" to={`/correcao-ponto?employee=${employeeId}&date=${d}`}>Corrigir</Link>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}