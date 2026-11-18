import { useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import Empty from '@/components/Empty';
import { Button } from '@/components/ui/button';
import { currentCompetence, money } from '@/lib/format';
import { inForce, loadLegalTables, vigenciaLabel } from '@/lib/legalTable';
import LegalTableForm from '@/components/params/LegalTableForm';

export default function LegalParams() {
  const [tables, setTables] = useState(null);
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const comp = currentCompetence();

  const load = () => loadLegalTables().then(setTables);
  useEffect(() => { load(); }, []);

  const vigente = useMemo(() => (tables || []).find((t) => inForce(t, comp)), [tables, comp]);

  return (
    <div className="space-y-6">
      <PageHeader code="RF11" title="Parâmetros legais" description="Tabelas de INSS, IRRF, FGTS e regras de ponto com vigência registrada. A folha usa sempre a tabela vigente na competência calculada." />

      <div className="border border-border bg-card px-4 py-3 text-sm">
        {vigente ? (
          <p>
            Tabela vigente em <strong>{comp}</strong>: <strong>{vigente.label}</strong> · {vigenciaLabel(vigente)}
            {vigente.notes && <span className="block text-xs text-muted-foreground">Fonte: {vigente.notes}</span>}
          </p>
        ) : (
          <p className="text-destructive">Não há tabela vigente para {comp}. O cálculo da folha fica bloqueado até cadastrar uma tabela para esta competência.</p>
        )}
      </div>

      {formOpen ? (
        <LegalTableForm
          initial={editing}
          onCancel={() => { setFormOpen(false); setEditing(null); }}
          onSaved={() => { setFormOpen(false); setEditing(null); load(); }}
        />
      ) : (
        <div className="flex justify-end"><Button onClick={() => { setEditing(null); setFormOpen(true); }}>Nova tabela</Button></div>
      )}

      {tables === null && <p className="text-sm text-muted-foreground">Carregando tabelas…</p>}
      {tables && tables.length === 0 && <Empty>Nenhuma tabela legal cadastrada.</Empty>}
      {tables && tables.map((t) => (
        <div key={t.id} className="border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <p className="font-semibold">
                {t.label}
                {inForce(t, comp) && <span className="ml-2 border border-emerald-600 bg-accent px-1.5 py-0.5 text-[11px] text-accent-foreground">Vigente</span>}
                {t.active === false && <span className="ml-2 border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">Inativa</span>}
              </p>
              <p className="text-xs text-muted-foreground">Vigência: {vigenciaLabel(t)}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setEditing(t); setFormOpen(true); }}>Editar</Button>
          </div>
          <div className="grid gap-px bg-border sm:grid-cols-3">
            <div className="bg-card px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">INSS</p>
              <p className="text-sm">{(t.inss_bands || []).map((b) => `${(b.rate * 100).toFixed(1)}%`).join(' · ')}</p>
            </div>
            <div className="bg-card px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">IRRF</p>
              <p className="text-sm">{(t.irrf_bands || []).map((b) => `${(b.rate * 100).toFixed(1)}%`).join(' · ')}</p>
            </div>
            <div className="bg-card px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">FGTS / hora extra</p>
              <p className="text-sm">{((Number(t.fgts_rate) || 0) * 100).toFixed(0)}% · +{Math.round(((Number(t.overtime_rate) || 1) - 1) * 100)}%</p>
            </div>
          </div>
          <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
            Dedução por dependente {money(t.irrf_dependent_deduction)} · Desconto simplificado {money(t.irrf_simplified_discount)} · Tolerância {t.tolerance_minutes} min · Divisor de falta {t.absence_divisor}
          </div>
        </div>
      ))}
    </div>
  );
}