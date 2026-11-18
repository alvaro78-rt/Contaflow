import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function DeleteEmployeeDialog({ employee, currentId, onClose, onDeleted }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setError('');
    if (employee.id === currentId) {
      return setError('Você não pode excluir o próprio acesso. Entre com o CPF do novo dono e exclua este cadastro por lá.');
    }
    if (employee.access_role === 'admin') {
      const admins = await base44.entities.Employee.filter({ access_role: 'admin' });
      if (admins.length <= 1) {
        return setError('Este é o administrador do sistema. Crie o acesso do novo dono antes de excluir este.');
      }
    }
    setBusy(true);
    await base44.entities.Employee.delete(employee.id);
    onDeleted(employee);
  };

  return (
    <Dialog open={!!employee} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Excluir cadastro</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Tem certeza que deseja excluir <strong className="text-foreground">{employee?.full_name}</strong>? O acesso ao sistema e o cadastro serão removidos. Esta ação não pode ser desfeita.
        </p>
        {error && <p className="border border-destructive bg-red-50 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="flex gap-3">
          <Button variant="destructive" onClick={confirm} disabled={busy}>{busy ? 'Excluindo…' : 'Excluir'}</Button>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}