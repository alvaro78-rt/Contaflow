import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Image } from '@/components/ui/image';
import { formatCpf, formatPis, fmtDate, money } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/auth';
import { STATUS_TEXT } from '@/components/employees/StatusBadge';

function Row({ k, v }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 py-1.5 text-sm">
      <span className="text-muted-foreground">{k}</span><span className="text-right">{v || '—'}</span>
    </div>
  );
}

export default function EmployeeDetails({ employee: e, positionName, onClose }) {
  const address = e ? [e.address, e.address_number && `nº ${e.address_number}`, e.address_complement, e.neighborhood, e.zip_code && `CEP ${e.zip_code}`, e.state].filter(Boolean).join(', ') : '';
  return (
    <Dialog open={!!e} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{e?.full_name}</DialogTitle></DialogHeader>
        {e && (
          <div>
            <div className="mb-4 flex items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden border border-border bg-secondary">
                {e.photo_url ? <Image src={e.photo_url} alt={e.full_name} className="h-16 w-16" fittingType="fill" /> : <span className="font-mono text-sm text-muted-foreground">{(e.full_name || '?').slice(0, 2).toUpperCase()}</span>}
              </div>
              <div>
                <p className="font-mono text-xs text-muted-foreground">{formatCpf(e.cpf)}</p>
                <p className="text-sm">{ROLE_LABEL[e.access_role] || 'Funcionário'}</p>
              </div>
            </div>
            <Row k="RG" v={e.rg} /><Row k="PIS" v={e.pis ? formatPis(e.pis) : ''} />
            <Row k="Nascimento" v={fmtDate(e.birth_date)} /><Row k="Estado civil" v={e.marital_status} /><Row k="Endereço" v={address} />
            <Row k="Admissão" v={fmtDate(e.admission_date)} /><Row k="Cargo" v={positionName} /><Row k="Contrato" v={e.contract_type} />
            <Row k="Departamento" v={e.department} />
            <Row k="Situação" v={`${STATUS_TEXT[e.status || 'ativo'] || 'Ativo'}${e.status_reason ? ` — ${e.status_reason}` : ''}`} />
            <Row k="Salário-base" v={money(e.base_salary)} /><Row k="Carga semanal" v={e.weekly_hours ? `${e.weekly_hours}h` : ''} />
            <Row k="Usuário" v={e.username} />
            <Row k="Banco" v={[e.bank_name, e.bank_agency && `ag. ${e.bank_agency}`, e.bank_account && `cc ${e.bank_account}`].filter(Boolean).join(' · ')} />
            <Row k="Pix" v={e.pix} />
            <p className="mt-4 text-xs font-semibold uppercase text-muted-foreground">Dependentes</p>
            {(e.dependents || []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum.</p>}
            {(e.dependents || []).map((d, i) => <Row key={i} k={`${d.name} (${d.relationship || 'dependente'})`} v={fmtDate(d.birth_date)} />)}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}