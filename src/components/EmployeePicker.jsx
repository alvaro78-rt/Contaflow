import { useEffect, useState } from 'react';
import { escapeRegExp } from 'lodash';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/SessionContext';
import { formatCpf, onlyDigits } from '@/lib/format';

export default function EmployeePicker({ value, onChange }) {
  const { session } = useSession();
  const locked = session?.role !== 'admin';
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);

  useEffect(() => {
    if (locked) {
      if (!value) base44.entities.Employee.get(session.id).then(onChange);
      return;
    }
    if (value) return;
    const digits = onlyDigits(q);
    const re = escapeRegExp(q);
    const query = q ? { $or: [{ full_name: { $regex: re, $options: 'i' } }, ...(digits ? [{ cpf: { $regex: digits } }] : [])] } : {};
    base44.entities.Employee.filter(query, { sort: 'full_name', limit: 6 }).then((r) => setList(r.items));
  }, [q, value, locked]);

  if (value) {
    return (
      <div className="flex items-center justify-between border border-border bg-card px-4 py-2.5">
        <div>
          <p className="font-medium">{value.full_name}</p>
          <p className="font-mono text-xs text-muted-foreground">{formatCpf(value.cpf)}</p>
        </div>
        {!locked && <Button variant="ghost" size="sm" onClick={() => onChange(null)}>Trocar</Button>}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Input placeholder="Buscar funcionário por nome ou CPF" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="divide-y divide-border border border-border bg-card">
        {list.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">Nenhum funcionário encontrado.</p>}
        {list.map((e) => (
          <button key={e.id} onClick={() => onChange(e)} className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-accent">
            <span className="font-medium">{e.full_name}</span>
            <span className="font-mono text-xs text-muted-foreground">{formatCpf(e.cpf)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}