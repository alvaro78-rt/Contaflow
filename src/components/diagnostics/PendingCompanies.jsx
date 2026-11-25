// Empresas sem vínculo confirmado: só contagem agregada, sem nome, CPF ou valor.
export default function PendingCompanies({ companies = [], total = 0 }) {
  if (!companies.length) return null;
  return (
    <section className="border border-amber-600/40 bg-amber-50/40">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-600/30 px-4 py-3">
        <h2 className="font-semibold">Empresas com titularidade pendente</h2>
        <span className="font-mono text-[10px] uppercase tracking-wide text-amber-800">
          acesso bloqueado
        </span>
      </div>
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">
          {total} empresa(s) sem titularidade ou vínculo de gestão confirmado para a sua conta. Os dados
          estão preservados, mas não são exibidos aqui. A validação do titular libera o acesso.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="py-2">Registro</th>
                <th>Situação</th>
                <th>Titularidade</th>
                <th className="text-right">Funcionários</th>
                <th className="text-right">Folhas</th>
                <th className="text-right">Marcações</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((row, index) => (
                <tr key={`${row.status}-${row.ownership}-${index}`} className="border-b border-border/50">
                  <td className="py-1.5 font-mono text-xs">#{index + 1}</td>
                  <td>{row.status}</td>
                  <td className="text-xs">
                    {row.ownership === 'sem_titular' ? 'sem titular registrado' : 'titular de outra conta'}
                  </td>
                  <td className="text-right font-mono">{row.counts.employees}</td>
                  <td className="text-right font-mono">{row.counts.payrolls}</td>
                  <td className="text-right font-mono">{row.counts.time_records}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
