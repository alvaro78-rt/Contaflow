import { Link } from 'react-router-dom';
import AuthShell from '@/components/auth/AuthShell';

export default function PortalForgot() {
  return <AuthShell title="Recuperar senha" subtitle="Solicite a redefinição ao RH da sua empresa.">
    <p>Após confirmar sua identidade, o responsável pelo cadastro pode definir uma nova senha.</p>
    <Link to="/login" className="font-medium text-primary underline">Voltar ao login</Link>
  </AuthShell>;
}
