import { useEffect, useState } from 'react';
import { rh } from '@/api/rh';
import { useSession } from '@/lib/SessionContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Field from '@/components/Field';
import Empty from '@/components/Empty';
import { currentCompetence, competenceLabel } from '@/lib/format';
import { fmtMin } from '@/lib/payroll';
import { downloadCsv } from '@/lib/csv';

export default function ReportTime() {
  const [comp, setComp] = useState(currentCompetence());
  const [rows, setRows] = useState([]);

  const { session } = useSession();
  const [error,setError] = useState('');
  useEffect(() => {
    let current = true;
    setRows([]); setError('');
    if (comp) rh(session,'timeReport',{competence:comp}).then(r => {if (current) setRows(r.items);})
      .catch(e => {if (current) setError(e.message);});
    return () => {current=false;};
  },[comp,session]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <Field label="Competência" className="max-w-[200px]"><Input type="month" value={comp} onChange={(e) => setComp(e.target.value)} /></Field>
        <Button
          variant="outline"
          disabled={rows.length === 0}
          onClick={() => downloadCsv(
            `ponto-${comp}.csv`,
            ['Competência', 'Funcionário', 'Horas trabalhadas', 'Dias sem ponto', 'Atrasos', 'Horas extras'],
            rows.map(({ e, st }) => [competenceLabel(comp), e.full_name, fmtMin(st.worked), st.absences, fmtMin(st.late), fmtMin(st.overtime)]),
          )}
        >
          Exportar CSV
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      {rows.length === 0 ? <Empty>Nenhum registro de ponto nesta competência.</Empty> : (
        <div className="overflow-x-auto border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2">Funcionário</th><th className="px-4 py-2 text-right">Horas trabalhadas</th><th className="px-4 py-2 text-right">Dias sem ponto</th><th className="px-4 py-2 text-right">Atrasos</th><th className="px-4 py-2 text-right">Horas extras</th>
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