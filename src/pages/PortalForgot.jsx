import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import AuthShell from '@/components/auth/AuthShell';

export default function PortalForgot() {
  return (
    <AuthShell title="Recuperar acesso" subtitle="O gerente é responsável por cadastrar e redefinir o acesso dos funcionários.">
      <p className="mb-4 text-sm text-muted-foreground">
        Para redefinir a senha, solicite ao gerente ou administrador da empresa.
        Ele poderá definir uma nova senha na edição do seu cadastro.
      </p>
      <Button asChild className="w-full"><Link to="/login">Voltar ao login</Link></Button>
    </AuthShell>
  );
}
