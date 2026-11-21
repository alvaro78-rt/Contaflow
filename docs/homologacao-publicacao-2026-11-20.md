# ContaFlow em 20 de novembro de 2026

A revisão foi feita a partir da `main` em `2bce555b239e92ac0be2df104b68644bdd963ef4`. A homologação local usou funcionários, empresas e folhas fictícios. Nenhum dado da Facet Soluções foi consultado ou gravado durante os testes funcionais.

## Estado observado nos serviços

| Área | Evidência |
| --- | --- |
| Editor Base44 | A prévia do app `6ae7c2d5ff47db9e2bde7c3e` mostrava Folha / Ledger. A pasta de funções do editor tem dez funções e não contém `payrollService`, `rhService` nem `manageCompany`. A conexão GitHub e a edição por agente externo mostravam um bloqueio do plano Builder. Publicar a partir dessa prévia pode republicar a interface antiga. |
| Base44 público | `/login` respondeu HTTP 200 sem o marcador da interface desta revisão. O bundle público consultado não continha a marca da função v2 nem a da v3. `GET /functions/payrollService` retornou 405 `metodo_invalido`. O POST da ação `release` sem sessão retornou 401 `sessao_invalida`. A resposta anônima não identifica se o runtime anterior é v1 ou v2. |
| Vercel | A produção respondia HTTP 200 e a API Vercel mostrava `READY` para o commit `2bce555`. A primeira prévia do PR também estava `READY` e servia a interface corrigida, mas o JavaScript compilado não tinha o App ID do Base44. Na prévia do commit `ac9d977`, `/login` respondeu HTTP 200, e o JavaScript compilado confirmou o App ID, a origem Base44 e a marca v3. A Vercel publica o frontend e o runtime de `payrollService` fica no Base44. |
| Segurança do Base44 | Novo scan concluído com um achado baixo agrupando dez URLs de funções invocáveis publicamente. A tela classificou a varredura de vulnerabilidades de código como recurso Builder. A invocação de uma URL e o acesso aos dados são verificações diferentes. O login por CPF ocorre dentro de `authCpf` e as funções de dados avaliam sessão e autorização no servidor. |

Funções listadas no achado do editor: `authCpf`, `createCompany`, `createEmployeeAccess`, `enterCompany`, `provisionMaster`, `recoverMaster`, `companyDashboard`, `employeePortal`, `listCompanies` e `listEmployees`. Nenhum achado foi reconhecido ou dispensado. O limite de tentativas de CPF continua local a cada instância da função. Uma proteção coordenada entre réplicas ainda depende da plataforma ou de armazenamento apropriado. A auditoria npm retornou zero vulnerabilidades conhecidas para o lockfile do GitHub no momento da execução.

## Correções

- O RH pode confirmar a data de pagamento de um rascunho automático e recalcular o IRRF. O servidor valida novamente os insumos e mantém o mesmo identificador de folha. A revisão, a aprovação e a finalização continuam sendo ações explícitas. Uma data inválida ou uma solicitação sem permissão mantém o rascunho intacto.
- O endpoint retorna 400 para JSON inválido. O diagnóstico de falhas internas mantém os códigos de etapa e a versão sem incluir dados financeiros. A causa do HTTP 500 histórico no app publicado exige logs de produção ou uma reprodução em uma homologação Base44 com dados fictícios.
- O frontend reconhece o App ID do ContaFlow nos seus domínios Base44 e Vercel mesmo quando o build não recebe a variável. Uma configuração explícita continua disponível para ambientes isolados. A versão das funções na URL fica restrita às prévias do editor Base44.
- O deploy seletivo agora confere a marca da função em execução e o marcador da interface em `/login`. O identificador do app é fixado no build do script Windows e o script verifica o runtime público antes de enviar o frontend. A rota de diagnóstico por GET responde com a versão e mantém o status HTTP 405. Um `unchanged` do CLI sozinho não comprova qual versão atende o endpoint.

## Testes executados

| Teste | Resultado |
| --- | --- |
| Testes de frontend e configuração | 40 aprovados |
| Funções e regras de backend, com SDK em memória | 35 aprovados |
| Integração via HTTP em `127.0.0.1` | 1 aprovada |
| Lint, TypeScript, build Vite, `git diff --check` | Aprovados |
| `npm audit --audit-level=high` | 0 vulnerabilidades relatadas |

A integração HTTP executou handlers reais de login por CPF, criação, retomada e seleção de empresa pela conta mestre, reativação de empresa fictícia com controle de perfil, lista de funcionários com isolamento, cálculo de rascunho, confirmação, aprovação, finalização e leitura do contracheque pelo titular. O armazenamento foi substituído por uma implementação em memória. A suíte do backend também cobriu marcação e correção de ponto, rubricas, folhas anteriores, férias, 13º, rescisão, troca de senha e bloqueios de autorização. Nos testes de falhas do SDK foram verificados estágios de diagnóstico de HTTP 500 e a preservação dos registros fictícios.

A confirmação do roteiro completo com runtime e banco reais da Base44 ainda depende de uma homologação isolada nessa plataforma. Para investigar a divergência relatada, o suporte deve confirmar qual artefato o endpoint público resolve e por que a publicação seletiva retorna `unchanged` para o código armazenado. Inclua o App ID, `payrollService`, as versões relatadas `2026-11-20-payroll-attendance-v1` e `2026-11-20-payroll-stage-diagnostics-v2`, horário, código HTTP e ID da requisição. A sondagem GET obteve HTTP 405 sem marca v3 com ID `f591e071-ddc9-4b75-98f2-431ee49e0e87`.


## Resultado da tentativa de publicação

A autorização de dispositivo foi concluída e `base44 whoami` confirmou a sessão. Para o app informado, o servidor recusou `functions pull payrollService`, `logs --env prod --function payrollService`, `sandbox ls base44/functions` e `functions deploy payrollService` com “You must be logged in to access this app”. O binário confirmou que selecionou exatamente uma função. A troca de ambiente e o App ID foram conferidos. O editor autenticado continuou acessível no navegador, mas seu código é de uma revisão diferente.

A Vercel gerou a [prévia protegida](https://contaflow-hd3427e69-alvaro-8627.vercel.app/login), associada ao commit `ac9d977`. O [GitHub Actions](https://github.com/alvaro78-rt/Contaflow/actions/runs/44710886596) concluiu com sucesso nesse commit. Foi mantida a produção existente nos dois serviços enquanto o runtime público da folha aguarda correção. O frontend da prévia está configurado para a origem Base44 existente e a homologação financeira usou somente o servidor local.

O [suporte do Base44](https://app.base44.com/support) precisa verificar por que a sessão OAuth do CLI é válida para `whoami` e recusada neste app, e identificar o artefato ativo da função em produção. A verificação autenticada da função deve ser repetida quando o acesso ao runtime for restabelecido.
