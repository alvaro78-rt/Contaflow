import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useServices } from '@/lib/ServicesContext';
import { formatCpf } from '@/lib/format';

// Espelho da lista real do mestre: o contrato atual devolve nome, dono, CPF e situação.
// O vínculo de acesso do dono não vem nessa resposta.
export default function DemoCompanyList({ token, version }) {
  const services = useServices();
  const [companies, setCompanies] = useState(null);
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(true);
  const [manual, setManual] = useState(0);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    setErro('');
    services.invoke('listCompanies', { token })
      .then((res) => { if (vivo) setCompanies(res?.data?.companies || []); })
      .catch(() => { if (vivo) { setCompanies(null); setErro('Não foi possível carregar a lista agora.'); } })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [token, version, manual]);

  return (
    <div className="border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="text-sm font-semibold">Empresas do mestre <span className="font-mono text-[11px] text-muted-foreground">(lista simulada)</span></p>
        <Button size="sm" variant="ghost" onClick={() => setManual((v) => v + 1)} disabled={loading}>
          <RefreshCw className="h-3.5 w-3.5" /> {loading ? 'Lendo…' : 'Atualizar lista'}
        </Button>
      </div>
      {loading && companies === null && <p className="px-4 py-5 text-sm text-muted-foreground">Carregando…</p>}
      {erro && <p className="m-4 border border-destructive bg-red-50 px-3 py-2 text-sm text-destructive">{erro}</p>}
      {!erro && companies?.map((c) => (
        <div key={c.id} className="border-b border-border px-4 py-3 last:border-0">
          <p className="font-medium">{c.name}</p>
          <p className="text-xs text-muted-foreground">
            {c.owner_name ? `Dono: ${c.owner_name}` : 'Sem dono definido'}{c.owner_cpf ? ` · ${formatCpf(c.owner_cpf)}` : ''}
          </p>
          <p className="mt-1 font-mono text-[11px] text-amber-700">vínculo de acesso não verificável por esta lista</p>
        </div>
      ))}
    </div>
  );
}