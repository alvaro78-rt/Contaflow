import { Button } from '@/components/ui/button';
import { Paperclip, X, Eye } from 'lucide-react';
import { openEvidence } from '@/lib/evidence';

export default function EvidencePicker({ uri, name, disabled, onUpload, onClear }) {
  if (uri) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={() => openEvidence(uri)}>
          <Eye className="h-3.5 w-3.5" /> {name || 'Evidência anexada'}
        </Button>
        {!disabled && (
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            <X className="h-3.5 w-3.5" /> Remover
          </Button>
        )}
      </div>
    );
  }
  return (
    <label className={`inline-flex items-center gap-1.5 border border-border bg-card px-2.5 py-1.5 text-xs font-medium ${disabled ? 'opacity-50' : 'cursor-pointer hover:border-emerald-600 hover:text-emerald-700'}`}>
      <Paperclip className="h-3.5 w-3.5" /> Anexar evidência
      <input
        type="file"
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload(file);
          event.target.value = '';
        }}
      />
    </label>
  );
}
