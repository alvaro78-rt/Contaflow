import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Field from '@/components/Field';
import Empty from '@/components/Empty';
import { currentCompetence, competenceLabel } from '@/lib/format';
import { monthStats, fmtMin } from '@/lib/payroll';
import { downloadCsv } from '@/lib/csv';

export default function ReportTime() {
  const [comp, setComp] = useState(currentCompetence());
  const [rows, setRows] = useState([]);

  useEffect(() => {
    (async () => {
      const [emps, scheds, recs] = await Promise.all([
        base44.entities.Employee.filter({}, { sort: 'full_name', limit: 200 }).then((r) => r.items),
        base44.entities.WorkSchedule.filter({}, { sort: 'name', limit: 100 }).then((r) => r.items),
        base44.entities.TimeRecord.filter({ date: { $gte: `${comp}-01`, $lte: `${comp}-31` } }, { limit: 2000 }),
      ]);
      const out = emps.map((e) => {
        const s = scheds.find((x) => x.id === e.schedule_id);
        const mine = recs.items.filter((r) => r.employee_id === e.id);
        return { e, st: monthStats(mine, s, comp), n: mine.length };
      }).filter((r) => r.n > 0);
      setRows(out);
    })();
  }, [comp]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <Field label="Competência" className="max-w-[200px]"><Input type="month" value={comp} onChange={(e) => setComp(e.target.value)} /></Field>
        <Button
          variant="outline"
          disabled={rows.length === 0}
          onClick={() => downloadCsv(
            `ponto-${comp}.csv`,
            ['Competência', 'Funcionário', 'Horas trabalhadas', 'Faltas', 'Atrasos', 'Horas extras'],
            rows.map(({ e, st }) => [competenceLabel(comp), e.full_name, fmtMin(st.worked), st.absences, fmtMin(st.late), fmtMin(st.overtime)]),
          )}
        >
          Exportar CSV
        </Button>
      </div>
      {rows.length === 0 ? <Empty>Nenhum registro de ponto nesta competência.</Empty> : (
        <div className="overflow-x-auto border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2">Funcionário</th><th className="px-4 py-2 text-right">Horas trabalhadas</th><th className="px-4 py-2 text-right">Faltas</th><th className="px-4 py-2 text-right">Atrasos</th><th className="px-4 py-2 text-right">Horas extras</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ e, st }) => (
                <tr key={e.id} className="border-b border-border/60">
                  <td className="px-4 py-2">{e.full_name}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmtMin(st.worked)}</td>
                  <td className="px-4 py-2 text-right font-mono">{st.absences}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmtMin(st.late)}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmtMin(st.overtime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}