import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Plus } from 'lucide-react';

export default function BandsEditor({ title, hint, bands, onChange, withDeduction = false }) {
  const list = bands || [];
  const update = (i, key, v) => onChange(list.map((b, idx) => (idx === i ? { ...b, [key]: v === '' ? 0 : Number(v) } : b)));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...list, { limit: 0, rate: 0, deduction: 0 }])}>
          <Plus className="h-3.5 w-3.5" /> Faixa
        </Button>
      </div>
      {list.map((b, i) => (
        <div key={i} className="grid grid-cols-[1fr_80px_auto] items-end gap-2 sm:grid-cols-[1fr_90px_90px_auto]">
          <Input type="number" step="0.01" value={b.limit} onChange={(e) => update(i, 'limit', e.target.value)} placeholder="Até (R$)" className="font-mono text-sm" />
          <Input type="number" step="0.01" value={(Number(b.rate) * 100).toFixed(2)} onChange={(e) => update(i, 'rate', Number(e.target.value) / 100)} placeholder="%" className="font-mono text-sm" />
          {withDeduction ? (
            <Input type="number" step="0.01" value={b.deduction ?? 0} onChange={(e) => update(i, 'deduction', e.target.value)} placeholder="Deduzir (R$)" className="font-mono text-sm" />
          ) : <span className="hidden sm:block" />}
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(list.filter((_, idx) => idx !== i))}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}
      {list.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma faixa cadastrada.</p>}
    </div>
  );
}