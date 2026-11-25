import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Field from '@/components/Field';
import AuditList from '@/components/access/AuditList';
import { formatCpf } from '@/lib/format';

export default function CompanyAccessCard({ company, busy, onAct }) {
  const [cpf, setCpf] = useState('');
  const digits = cpf.replace(/\D/g, '');
  const managers = company.managers || [];
  const submit = (event) => {
    event.preventDefault();
    if (digits.length === 11) onAct(company, 'grant', digits);
  };
  return (
    <section className="border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{company.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {company.owner_name ? `Titular: ${company.owner_name}` : 'Sem titular registrado'}
            {company.owner_cpf ? ` · ${formatCpf(company.owner_cpf)}` : ''}
          </p>
        </div>
        <span className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-wide ${
          company.status === 'ativa' ? 'border-emerald-600 text-emerald-700' : 'border-border text-muted-foreground'
        }`}>
          {company.status}
        </span>
      </header>
      <div className="space-y-4 px-4 py-4">
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Contas autorizadas
          </p>
          {managers.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma conta autorizada além do titular e dos administradores da empresa.</p>
          )}
          {managers.map((manager) => (
            <div key={manager.cpf} className="flex flex-wrap items-center justify-between gap-2 border border-border px-3 py-2">
              <span className="text-sm">
                <span className="font-mono">{formatCpf(manager.cpf)}</span>
                {manager.name ? ` · ${manager.name}` : ''}
              </span>
              <Button size="sm" variant="outline" className="text-destructive" disabled={busy} onClick={() => onAct(company, 'revoke', manager.cpf)}>
                Revogar
              </Button>
            </div>
          ))}
        </div>
        <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
          <Field label="CPF da conta mestre" className="min-w-[200px] flex-1">
            <Input inputMode="numeric" maxLength={14} placeholder="Somente números" value={cpf} onChange={(event) => setCpf(event.target.value)} />
          </Field>
          <Button type="submit" disabled={busy || digits.length !== 11}>{busy ? 'Registrando…' : 'Autorizar'}</Button>
        </form>
        <AuditList audit={company.audit} />
      </div>
    </section>
  );
}
