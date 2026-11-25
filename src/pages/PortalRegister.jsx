import { Navigate } from 'react-router-dom';

// Cadastro próprio de colaboradores removido: o acesso nasce apenas pelo RH/gerente.
// O primeiro acesso da instalação é a única exceção, em /cadastro.
export default function PortalRegister() {
  return <Navigate to="/login" replace />;
}
