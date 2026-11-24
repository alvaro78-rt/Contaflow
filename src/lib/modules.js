import { UserPlus, Search, Briefcase, CalendarClock, Fingerprint, FilePenLine, Tags, Calculator, History, Receipt, BarChart3, Settings2, TreePalm, Gift, FileX, ShieldCheck } from 'lucide-react';

export const MODULES = [
  { path: '/funcionarios/novo', code: 'RF03', title: 'Cadastro de Funcionários', desc: 'Dados pessoais, dependentes, contrato e banco.', icon: UserPlus },
  { path: '/funcionarios', code: 'RF04', title: 'Consulta de Funcionários', desc: 'Busca por nome, CPF ou cargo.', icon: Search },
  { path: '/cargos', code: 'RF05', title: 'Cargos', desc: 'Cargos e códigos de identificação.', icon: Briefcase },
  { path: '/jornadas', code: 'RF06', title: 'Jornadas e Horários', desc: 'Cargas horárias, dias e horários de trabalho.', icon: CalendarClock },
  { path: '/ponto', code: 'RF07', title: 'Controle de Ponto', desc: 'Marcações, faltas, atrasos e horas extras.', icon: Fingerprint },
  { path: '/correcao-ponto', code: 'RF08', title: 'Correção de Ponto', desc: 'Corrige marcações preservando o original.', icon: FilePenLine },
  { path: '/rubricas', code: 'RF09', title: 'Rubricas', desc: 'Proventos, descontos, informativas e redutoras.', icon: Tags },
  { path: '/folha', code: 'RF10', title: 'Folha de Pagamento', desc: 'Processa, confere, aprova e finaliza a folha.', icon: Calculator },
  { path: '/ferias', code: 'RF18', title: 'Férias', desc: 'Períodos aquisitivos, 1/3 e abono pecuniário.', icon: TreePalm },
  { path: '/decimo-terceiro', code: 'RF19', title: '13º Salário', desc: 'Parcelas, proporcional e descontos.', icon: Gift },
  { path: '/rescisao', code: 'RF20', title: 'Rescisão', desc: 'Verbas rescisórias com memória de cálculo.', icon: FileX },
  { path: '/folhas-anteriores', code: 'RF13', title: 'Folhas Anteriores', desc: 'Histórico por competência e funcionário.', icon: History },
  { path: '/contracheques', code: 'RF14', title: 'Contracheques', desc: 'Contracheque fiel à folha registrada.', icon: Receipt },
  { path: '/relatorios', code: 'RF15', title: 'Relatórios', desc: 'Pagamento, ponto, recibo, resumo e FGTS.', icon: BarChart3 },
  { path: '/parametros', code: 'RF11', title: 'Parâmetros Legais', desc: 'Tabelas de INSS, IRRF, FGTS e regras com vigência.', icon: Settings2 },
  { path: '/diagnostico', code: 'RF21', title: 'Diagnóstico do Sistema', desc: 'Versão publicada do backend e reconciliação de registros órfãos.', icon: ShieldCheck },
];
