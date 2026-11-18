import { useState } from 'react';
import { employeeError, saveEmployee } from '@/api/employeeAdmin';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function DeleteEmployeeDialog({ employee, token, onClose, onDeleted }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setError('');
    setBusy(true);
    try {
      await saveEmployee(token, { action: 'delete', id: employee.id });
      onDeleted(employee);
    } catch (err) {
      setError(employeeError(err, 'Não foi possível excluir o cadastro.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!employee} onOpenChange={(o) => { if (!o && !busy) { setError(''); onClose(); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Excluir cadastro</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Tem certeza que deseja excluir <strong className="text-foreground">{employee?.full_name}</strong>? O acesso ao sistema e o cadastro serão removidos. Esta ação não pode ser desfeita.
        </p>
        {error && <p className="border border-destructive bg-red-50 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="flex gap-3">
          <Button variant="destructive" onClick={confirm} disabled={busy}>{busy ? 'Excluindo…' : 'Excluir'}</Button>
          <Button variant="ghost" disabled={busy} onClick={() => { setError(''); onClose(); }}>Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}