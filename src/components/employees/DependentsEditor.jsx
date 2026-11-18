import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Field from '@/components/Field';

export default function DependentsEditor({ value = [], onChange }) {
  const set = (i, k, v) => onChange(value.map((d, idx) => (idx === i ? { ...d, [k]: v } : d)));
  return (
    <div className="space-y-3">
      {value.length === 0 && <p className="text-sm text-muted-foreground">Nenhum dependente cadastrado.</p>}
      {value.map((d, i) => (
        <div key={i} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
          <Field label="Nome"><Input value={d.name || ''} onChange={(e) => set(i, 'name', e.target.value)} /></Field>
          <Field label="Parentesco"><Input placeholder="Filho(a)" value={d.relationship || ''} onChange={(e) => set(i, 'relationship', e.target.value)} /></Field>
          <Field label="Nascimento"><Input type="date" value={d.birth_date || ''} onChange={(e) => set(i, 'birth_date', e.target.value)} /></Field>
          <Button variant="ghost" size="icon" onClick={() => onChange(value.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => onChange([...value, { name: '', relationship: '', birth_date: '' }])}>
        <Plus className="mr-1 h-4 w-4" /> Adicionar dependente
      </Button>
    </div>
  );
}