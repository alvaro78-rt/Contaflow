# ContaFlow em 20 de novembro de 2026

A revisão foi feita a partir da `main` em `2bce555b239e92ac0be2df104b68644bdd963ef4`. A homologação local usou funcionários, empresas e folhas fictícios. Nenhum dado da Facet Soluções foi consultado ou gravado durante os testes funcionais.

## Estado observado nos serviços

| Área | Evidência |
| --- | --- |
| Editor Base44 | A prévia do app `6ae7c2d5ff47db9e2bde7c3e` mostrava Folha / Ledger. A conexão GitHub e a edição por agente externo mostravam um bloqueio do plano Builder. Publicar a partir dessa prévia pode republicar a interface antiga. |
| Base44 público | `/login` respondeu HTTP 200 sem o marcador da interface desta revisão. O bundle público consultado não continha a marca da função v2 nem a da v3. `GET /functions/payrollService` retornou 405 `metodo_invalido`. O POST da ação `release` sem sessão retornou 401 `sessao_invalida`. A resposta anônima não identifica se o runtime anterior é v1 ou v2. |
| Vercel | A produção respondia HTTP 200 e a API Vercel mostrava `READY` para o commit `2bce555`. Um deployment de frontend Vercel não publica `payrollService` no Base44. |
| Segurança do Base44 | Novo scan concluído com um achado baixo agrupando dez URLs de funções invocáveis publicamente. A tela classificou a varredura de vulnerabilidades de código como recurso Builder. A invocação de uma URL e o acesso aos dados são verificações diferentes. O login por CPF ocorre dentro de `authCpf` e as funções de dados avaliam sessão e autorização no servidor. |

Funções listadas no achado do editor: `authCpf`, `createCompany`, `createEmployeeAccess`, `enterCompany`, `provisionMaster`, `recoverMaster`, `companyDashboard`, `employeePortal`, `listCompanies` e `listEmployees`. Nenhum achado foi reconhecido ou dispensado. O limite de tentativas de CPF continua local a cada instância da função. Uma proteção coordenada entre réplicas ainda depende da plataforma ou de armazenamento apropriado. A auditoria npm retornou zero vulnerabilidades conhecidas para o lockfile do GitHub no momento da execução.

## Correções

- O RH pode confirmar a data de pagamento de um rascunho automático e recalcular o IRRF. O servidor valida novamente os insumos e mantém o mesmo identificador de folha. A revisão, a aprovação e a finalização continuam sendo ações explícitas. Uma data inválida ou uma solicitação sem permissão mantém o rascunho intacto.
- O endpoint retorna 400 para JSON inválido. O diagnóstico de falhas internas mantém os códigos de etapa e a versão sem incluir dados financeiros. A causa do HTTP 500 histórico no app publicado exige logs de produção ou uma reprodução em uma homologação Base44 com dados fictícios.
- O deploy seletivo agora confere a marca da função em execução e o marcador da interface em `/login`. O identificador do app é fixado no build do script Windows e o script verifica o runtime público antes de enviar o frontend. A rota de diagnóstico por GET responde com a versão e mantém o status HTTP 405. Um `unchanged` do CLI sozinho não comprova qual versão atende o endpoint.

## Testes executados

| Teste | Resultado |
| --- | --- |
| Testes de frontend e configuração | 38 aprovados |
| Funções e regras de backend, com SDK em memória | 35 aprovados |
| Integração via HTTP em `127.0.0.1` | 1 aprovada |
| Lint, TypeScript, build Vite, `git diff --check` | Aprovados |
| `npm audit --audit-level=high` | 0 vulnerabilidades relatadas |

A integração HTTP executou handlers reais de login por CPF, lista e seleção de empresa pela conta mestre, lista de funcionários com isolamento, cálculo de rascunho, confirmação, aprovação, finalização e leitura do contracheque pelo titular. O armazenamento foi substituído por uma implementação em memória. A suíte do backend também cobriu marcação e correção de ponto, rubricas, folhas anteriores, férias, 13º, rescisão, troca de senha e bloqueios de autorização. Nos testes de falhas do SDK foram verificados estágios de diagnóstico de HTTP 500 e a preservação dos registros fictícios.

A confirmação do roteiro completo com runtime e banco reais da Base44 ainda depende de uma homologação isolada nessa plataforma. Para investigar a divergência relatada, o suporte deve confirmar qual artefato o endpoint público resolve e por que a publicação seletiva retorna `unchanged` para o código armazenado. Inclua o App ID, `payrollService`, as versões relatadas `2026-11-20-payroll-attendance-v1` e `2026-11-20-payroll-stage-diagnostics-v2`, horário, código HTTP e ID da requisição, quando disponível.
