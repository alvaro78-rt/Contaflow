import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import Layout from '@/components/Layout';
import { SessionProvider } from '@/lib/SessionContext';
import RequireSession from '@/components/RequireSession';
import AdminOnly from '@/components/AdminOnly';
import PortalLogin from '@/pages/PortalLogin';
import MasterSetup from '@/pages/MasterSetup';
import MasterRecovery from '@/pages/MasterRecovery';
import Companies from '@/pages/Companies';
import RequireMaster from '@/components/RequireMaster';
import PortalRegister from '@/pages/PortalRegister';
import PortalForgot from '@/pages/PortalForgot';
import Dashboard from '@/pages/Dashboard';
import EmployeeSearch from '@/pages/EmployeeSearch';
import EmployeeForm from '@/pages/EmployeeForm';
import NewEmployee from '@/pages/NewEmployee';
import Positions from '@/pages/Positions';
import Schedules from '@/pages/Schedules';
import TimeControl from '@/pages/TimeControl';
import TimeCorrection from '@/pages/TimeCorrection';
import Rubrics from '@/pages/Rubrics';
import PayrollGenerate from '@/pages/PayrollGenerate';
import PastPayrolls from '@/pages/PastPayrolls';
import Vacations from '@/pages/Vacations';
import Thirteenth from '@/pages/Thirteenth';
import Termination from '@/pages/Termination';
import Payslips from '@/pages/Payslips';
import MyAccount from '@/pages/MyAccount';
import Reports from '@/pages/Reports';
import LegalParams from '@/pages/LegalParams';

// O ContaFlow autentica o usuário por CPF nas funções authCpf e usa
// SessionProvider/RequireSession para proteger as rotas. O login próprio
// não deve ficar bloqueado pelo login OAuth ou public settings do Base44.
const AuthenticatedApp = () => {
  // Render the main app
  return (
    <Routes>
      <Route path="/login" element={<PortalLogin />} />
      <Route path="/cadastro" element={<PortalRegister />} />
      <Route path="/recuperar-senha" element={<PortalForgot />} />
      <Route path="/mestre" element={<MasterSetup />} />
      <Route path="/recuperar-mestre" element={<MasterRecovery />} />
      <Route element={<RequireMaster />}>
        <Route path="/empresas" element={<Companies />} />
      </Route>
      <Route element={<RequireSession />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/ponto" element={<TimeControl />} />
          <Route path="/contracheques" element={<Payslips />} />
          <Route path="/minha-senha" element={<MyAccount />} />
          <Route element={<AdminOnly management />}>
            <Route path="/funcionarios" element={<EmployeeSearch />} />
            <Route path="/funcionarios/novo" element={<EmployeeForm />} />
            <Route path="/funcionarios/novo/rapido" element={<NewEmployee />} />
            <Route path="/funcionarios/:id/editar" element={<EmployeeForm />} />
            <Route path="/cargos" element={<Positions />} />
            <Route path="/folha" element={<PayrollGenerate />} />
            <Route path="/jornadas" element={<Schedules />} />
          </Route>
          <Route element={<AdminOnly />}>
            <Route path="/correcao-ponto" element={<TimeCorrection />} />
            <Route path="/rubricas" element={<Rubrics />} />
            <Route path="/ferias" element={<Vacations />} />
            <Route path="/decimo-terceiro" element={<Thirteenth />} />
            <Route path="/rescisao" element={<Termination />} />
            <Route path="/folhas-anteriores" element={<PastPayrolls />} />
            <Route path="/relatorios" element={<Reports />} />
            <Route path="/parametros" element={<LegalParams />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <SessionProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </SessionProvider>
  )
}

export default App