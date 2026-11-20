# Homologação do ContaFlow com SQLite

O primeiro teste de integração independente executa os handlers de folha e contracheque do PR #8 por HTTP local e grava exclusivamente fixtures em um banco SQLite temporário. O arquivo fica em um diretório novo e o servidor escuta apenas em `127.0.0.1`.

Execute com Node.js 24:

```sh
node --test tests/homologacao/folha.js
```

O teste cobre recusa ao funcionário que tenta calcular, isolamento entre duas empresas, cálculo automático, exigência de confirmação da data de pagamento, aprovação, finalização e visibilidade do contracheque. Uma segunda conexão SQLite confirma que foi gravada uma única folha finalizada. O teste usa sessões fictícias pré-carregadas.

O adaptador é de teste e cobre as operações necessárias a esse cenário. Para uma aplicação hospedada, faltam um banco persistente apropriado ao ambiente, a integração da interface, autenticação e sessões em execução, as operações dos demais módulos e a homologação completa. A transição da Facet exige autorização e conferência própria da origem e do destino dos dados, dos vínculos e dos históricos.

## Abrir a interface na homologação local

```sh
npm ci
node scripts/homologar-independente.mjs
```

Abra http://127.0.0.1:4179/login no mesmo computador. O terminal informa os CPFs e a senha fictícios. O servidor encaminha as chamadas da interface para os handlers do repositório. As sessões, empresas e folhas de teste persistem em `.homologacao.local/ficticio.sqlite`. O servidor só escuta em loopback, rejeita outras origens nas chamadas e bloqueia acesso HTTP aos arquivos do banco. Use esta instância exclusivamente com dados fictícios.

Para rodar os dois testes de integração SQLite:

```sh
node --test tests/homologacao/folha.js tests/homologacao/gateway.test.js
```

A integração ampliada verifica login por CPF, seleção de empresa, painel, isolamento na listagem de empregados, ponto, parâmetros legais, folha, contracheque, persistência após reabertura do banco e invalidação de sessão no logout. O servidor de homologação usa SQLite de processo único. Recuperação mestre via identidade Base44 e upload de arquivos ficam indisponíveis nessa instância. Uma implantação pública precisa de serviço de aplicação, armazenamento persistente, controles operacionais e validação das rotinas restantes.
