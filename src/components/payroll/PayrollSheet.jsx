import { AlertTriangle } from 'lucide-react';
import { money, competenceLabel, formatCpf } from '@/lib/format';
import { fmtMin } from '@/lib/payroll';

export const STATUS_LABEL = { rascunho: 'Aguardando conferência', aprovada: 'Aprovada', finalizada: 'Finalizada' };

function Block({ title, items = [], total = undefined, totalLabel = undefined }) {
  return (
    <div className="border border-border bg-card">
      <p className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {items.map((i, idx) => (
        <div key={idx} className="flex justify-between border-b border-border/60 px-4 py-2 text-sm">
          <span>{i.description}</span>
          <span className="font-mono">{money(i.value)}</span>
        </div>
      ))}
      {totalLabel && (
        <div className="flex justify-between bg-secondary/60 px-4 py-2 text-sm font-semibold">
          <span>{totalLabel}</span>
          <span className="font-mono">{money(total)}</span>
        </div>
      )}
    </div>
  );
}

export default function PayrollSheet({ payroll: p }) {
  const inconsistent = Math.abs(p.net_salary - (p.total_earnings - p.total_deductions)) > 0.005;
  const t = p.time_summary || {};
  // Bloqueia a exibição de valores de prévias antigas, que nunca foram folhas gravadas.
  if (p.preview_only) {
    return (
      <p role="alert" className="border border-amber-600 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        O período ainda não foi apurado. Confira os registros de ponto para gerar uma folha real.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-px border border-border bg-border sm:grid-cols-4">
        {[['Funcionário', p.employee_name], ['CPF', formatCpf(p.employee_cpf)], ['Cargo', p.position_name || '—'], ['Competência', competenceLabel(p.competence)]].map(([k, v]) => (
          <div key={k} className="bg-card px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</p>
            <p className="font-medium">{v}</p>
          </div>
        ))}
      </div>
      {p.attendance_pending ? (
        <p className="text-xs font-medium text-amber-900">Ponto do período: não apurado. Não é possível confirmar dias trabalhados, faltas ou horas extras.</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Ponto do período: {fmtMin(t.worked || 0)}h trabalhadas · {t.absences || 0} falta(s) · {fmtMin(t.late || 0)}h de atraso · {fmtMin(t.overtime || 0)}h extras
        </p>
      )}
      {p.input_review?.attendance_source === 'conferencia' && (
        <p className="text-xs font-medium text-emerald-800">
          Frequência comprovada por conferência mensal autorizada
          {p.input_review.conference_authorized_by ? ` por ${p.input_review.conference_authorized_by}` : ''}
          {p.input_review.conference_authorized_at
            ? ` em ${new Date(p.input_review.conference_authorized_at).toLocaleDateString('pt-BR')}`
            : ''}.
        </p>
      )}
      {p.calc_memory && (
        <p className="text-xs text-muted-foreground">
          Tabela legal: {p.legal_table_label || '—'} · Base INSS {money(p.calc_memory.inss_base)} · Base IRRF {money(p.calc_memory.irrf_base)} ({p.calc_memory.irrf_dependents || 0} dependente(s)) · FGTS {((p.calc_memory.fgts_rate || 0) * 100).toFixed(0)}% sobre {money(p.calc_memory.fgts_base)}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Block title="Proventos" items={p.earnings} total={p.total_earnings} totalLabel="Total de proventos" />
        <Block title="Descontos" items={p.deductions} total={p.total_deductions} totalLabel="Total de descontos" />
      </div>
      <Block title="Informativas" items={p.informatives} />
      {inconsistent && (
        <div className="flex items-center gap-2 border border-destructive bg-red-50 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" /> Divergência: o salário líquido não corresponde a proventos menos descontos. Verifique antes de aprovar.
        </div>
      )}
      <div className="flex items-end justify-between border border-emerald-600 bg-accent px-5 py-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-emerald-800">Salário líquido</p>
          <p className="text-xs text-emerald-800/70">Proventos − Descontos · Salário-base {money(p.base_salary)}</p>
        </div>
        <p className="font-mono text-3xl font-semibold text-emerald-700">{money(p.net_salary)}</p>
      </div>
    </div>
  );
}
