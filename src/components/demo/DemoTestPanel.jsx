import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { runDemoTests } from '@/lib/demoEngine';

export default function DemoTestPanel() {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      setResult(await runDemoTests());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 border border-border bg-card px-4 py-3">
        <p className="text-sm">Bateria em memória: nenhuma chamada à base hospedada.</p>
        <Button size="sm" onClick={run} disabled={busy}>{busy ? 'Executando…' : 'Executar bateria'}</Button>
        {result && (
          <span className="font-mono text-xs text-muted-foreground">
            {result.rows.filter((r) => r.ok).length}/{result.rows.length} aprovados
          </span>
        )}
      </div>

      {result && (
        <div className="overflow-x-auto border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Cenário</th>
                <th className="px-3 py-2">Obtido</th>
                <th className="px-3 py-2">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.cenario} className="border-t border-border align-top">
                  <td className="px-3 py-2">
                    <p className="font-medium">{r.cenario}</p>
                    <p className="text-xs text-muted-foreground">{r.esperado}</p>
                    {r.obs && <p className="mt-1 text-xs text-amber-700">{r.obs}</p>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.obtido}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 font-mono text-[11px] ${r.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                      {r.ok ? 'aprovado' : 'falhou'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result && (
        <ul className="space-y-1 border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          {result.notes.map((n) => <li key={n}>· {n}</li>)}
        </ul>
      )}
    </div>
  );
}