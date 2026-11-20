# Atualização de autenticação — 20/11/2026

A auditoria Base44 identificou **dois alertas no mesmo arquivo**, `base44/functions/authCpf/entry.ts`:

1. **`masterExists` disponível sem login:** acesso intencional para determinar se o fluxo de cadastro inicial deve aparecer. A resposta revela apenas um booleano (instalação provisionada ou não), sem registros de empregados. Não se pode exigir autenticação Base44 em toda a função, pois isso impediria o login por CPF e a ativação pré-login. É um risco residual que precisa ser aceito ou alterado em conjunto com o design de cadastro.
2. **Login sem bloqueio progressivo:** corrigido parcialmente com uma proteção que contabiliza tentativas de login e ativação antes de verificar credenciais e retorna `429` e `Retry-After` depois de cinco tentativas. O contador é limpo após login bem-sucedido e é limitado no uso de memória. **Limitação:** o contador existe apenas na instância de função que atende à solicitação. Para mitigação robusta e consistente entre réplicas, é necessário um controle distribuído pela plataforma Base44 ou um armazenamento de tentativas dedicado e auditado.

Código integrado na `main` no commit `3643cade30fababaa885d3bb160a863de9bfd052`, por meio do PR [#7](https://github.com/alvaro78-rt/Contaflow/pull/7).

**Testes:** 28 de backend e 7 de interface (**35/35 aprovados**), typecheck/lint/build aprovados e `npm audit` com zero vulnerabilidades conhecidas no repositório. O teste de autenticação verifica bloqueio após tentativas inválidas, limpeza do contador e login correto com sessão persistida em memória.

**Publicação:** frontend Vercel deploy `dpl_5uD569TJCpvS1fExYdKyFBUsa4ja` `READY`, mas `authCpf` no Base44 **ainda não foi atualizado nesta revisão**. O deployment seletivo de `authCpf` deve incluir `base44/shared/loginThrottle.js`. Uma publicação do app no editor Base44 é necessária para garantir que a versão atual chegue ao endpoint público; antes, conferir pendências na branch principal e no painel Segurança.

**Dependências:** o GitHub não contém `zod` no manifesto ou lockfile, e utiliza Vite 8.3.8. Os alertas do scanner Base44 podem permanecer se o editor estiver usando outras versões; o ajuste na Vercel sozinho não atualiza as dependências do editor.

**Folha de pagamento:** o erro `ponto_nao_conferido` vinha de um commit antigo de `payrollService`, mas ainda foi observado no endpoint público Base44 após deploys seletivos. É necessário verificar/publicar a versão ativa na plataforma sem sincronizações destrutivas de entidades.

**Nenhuma empresa, funcionário, sessão, folha, ponto, cadastro ou histórico foi modificado por esta revisão.**

---

# ContaFlow — revisão de segurança de 20/11/2026

## Origem

A auditoria do aplicativo Base44 **`6ae7c2d5ff47db9e2bde7c3e`** exibiu quatro achados altos: duas funções marcadas como "Qualquer pessoa pode executar esta função", `zod@3.25.76` e `vite@8.2.0`. O usuário não enviou as linhas expandidas com os nomes das duas funções. Portanto **não há evidência suficiente para dizer quais foram sinalizadas**.

O aviso anterior relativo ao nome do segredo `APP_OWNER_USER_ID` deixou de aparecer depois de o proprietário cadastrar o nome no painel de segredos. Isso **não certifica** que o valor foi configurado corretamente ou que a recuperação foi testada.

## Correções concluídas no GitHub/Vercel

Commit `c46bb87411dcd662d76129b9a7d1fe63497fd145`, PR [#6](https://github.com/alvaro78-rt/Contaflow/pull/6).

- `recoverMaster`, `provisionMaster`, `companyDashboard`, `enterCompany` e `listCompanies` não retornam mais exceções internas via `error.message` no HTTP 500.
- `vite` fixado em **8.3.8** no `package.json` e `package-lock.json`; anteriormente o manifesto dizia `^8.2.0`, embora o lockfile já instalasse 8.3.8.
- `zod` já não está presente como dependência nem pacote instalado no lockfile atual do GitHub.
- Dois testes adicionados para confirmar que recuperação da conta mestre com identidade incorreta ou chave inválida não chega a consultar nem escrever no banco.
- 25 testes de backend e 7 testes frontend aprovados; `npm ci`, typecheck, lint e build aprovados; `npm audit` retornou zero vulnerabilidades conhecidas.

Frontend de produção Vercel publicado no deployment `dpl_2iJHL92LkY7bvjdkYRL39eeaHZ9d`, estado `READY`.

## Autorização de funções: leitura de código, não resultado do scanner

- `authCpf` atende autenticação inicial por CPF/senha; esta rota **precisa** ser invocável antes do login. Ações de alteração de senha e logout exigem sessão interna; a ação de ativação verifica CPF, nascimento e cadastro pré-existente. Por ser pública, merece rate limiting, monitoramento de tentativas e auditoria de ativação, sem desativar o login.
- `provisionMaster` é a etapa de criação da primeira conta e exige `BOOTSTRAP_TOKEN` armazenado como segredo; não cria conta se já houver funcionários ou empresas cadastrados. Torná-la privada com autenticação Base44 pode inviabilizar a primeira instalação. Considerar bloquear/desativar esse endpoint **após** confirmar que a instalação já foi provisionada, sem alterar seus dados.
- `recoverMaster` exige identidade Base44 autenticada, ID de proprietário configurado e chave `MASTER_RECOVERY_KEY`; não expõe mais mensagens internas de erro no código corrigido.
- As demais funções analisadas usam sessão interna via `loadSession` ou `employeeAdmin`, e o controle da empresa é avaliado no servidor.

**Não** concluir que os dois alertas se referem necessariamente a `authCpf` e `provisionMaster`: os nomes devem ser obtidos expandindo cada achado no Base44 antes de alterar permissões ou marcar como revisado.

## Pendências fora do alcance de GitHub/Vercel

As funções hospedadas e as dependências do editor **Base44 não são sincronizadas automaticamente pelo deploy da Vercel**. Portanto, o status atual da auditoria Base44 permanece **não verificado** depois dessas alterações.

1. Verificar nomes e evidências das duas funções públicas no painel Base44. Não executar "Corrigir tudo" indiscriminadamente; o login por CPF precisa estar acessível para convidados.
2. Revisar a publicação das cinco funções protegidas contra detalhes de exceção em `base44/functions/*/entry.ts` via CLI autenticada, apenas com `functions deploy <nomes>` e backup adequado; não executar `base44 deploy`, `entities push` ou `--force`.
3. Atualizar as **dependências do próprio projeto Base44** (se estiver executando versão antiga de `package.json`) e confirmar as versões pela auditoria da plataforma; o `npm audit` do GitHub não certifica a instalação Base44.
4. Reexecutar o Security Scan e testar autenticação, recuperação, perfis e isolamento de empresas em ambiente isolado.
5. A causa do código de erro remoto `ponto_nao_conferido` na folha de pagamento segue em investigação separada; nenhum dado de ponto ou folha real foi alterado nesta revisão.

## Operação segura

Nenhuma empresa, funcionário, registro de ponto, folha, conta mestre, segredo armazenado ou schema da Facet Soluções foi modificado pelas mudanças desta revisão. Todos os testes foram feitos em cópias e fixtures isoladas. Não enviar valores de segredos, cookies, tokens de sessão, senhas ou CPFs ao suporte ou a terceiros.
