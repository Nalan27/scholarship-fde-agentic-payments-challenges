# Infraestrutura do desafio

Este pacote define a infraestrutura AWS com CDK em TypeScript. O escopo
aprovado no momento é somente o backend: mantenha o frontend local e não
implante S3 ou CloudFront até nova orientação da coordenação. A stack está
configurada para `us-east-1`.

## Estado atual e arquitetura

- Cinco tabelas DynamoDB para produtos, usuários, conversas, intenções e
  transações.
- User Pool do Cognito sem auto cadastro, com login por e-mail e recuperação
  de conta por e-mail. A criação de usuários deve ser administrativa.
- App client público para o frontend local, com autenticação SRP e sem OAuth
  nem segredo.
- HTTP API com JWT authorizer Cognito como autorização padrão. CORS permite
  somente `http://localhost:3000`.
- A rota `POST /chat` ainda está ligada a uma Lambda temporária, que valida a
  presença do `sub` e responde `501 AGENT_NOT_IMPLEMENTED`. Ela ainda não
  invoca o agente Strands no Bedrock AgentCore nem o modelo Claude Haiku 4.5.
- As três ferramentas do chatbot foram portadas para Lambdas TypeScript:
  `listar_catalogo`, `registrar_intencao` e `realizar_compra`. Elas ainda não
  estão conectadas ao agente.
- A compra usa uma única transação DynamoDB condicional para marcar a intenção
  como paga, debitar o limite restante, atualizar o estoque e gravar a
  transação. A chave da transação é a intenção, impedindo pagamento duplicado.
- Cada Lambda tem grupo de logs com retenção de uma semana e papel separado,
  com permissões de DynamoDB limitadas às tabelas e operações necessárias.
- As chamadas das ferramentas, inclusive recusas, são registradas na tabela
  de conversas, sem adicionar uma sexta tabela.

O modelo informado pela coordenação é
`us.anthropic.claude-haiku-4-5-20251001-v1:0`. A primeira chamada ao modelo
pode registrar a inscrição na conta; não faça essa chamada até a validação
local estar pronta e o custo ser autorizado.

## Modelo de dados DynamoDB

| Tabela | Chave de partição | Chave de ordenação | Uso |
|---|---|---|---|
| `AlanLorenz-Produtos` | `id` | — | Catálogo, preço em centavos e estoque |
| `AlanLorenz-Usuarios` | `userId` | — | `sub` do Cognito e limite restante em centavos |
| `AlanLorenz-Conversas` | `userId` | `messageKey` | Auditoria das tools; `messageKey` usa `<conversaId>#tool#<data ISO>#<id>` |
| `AlanLorenz-Intencoes` | `intentionId` | — | Proprietário, conversa, total calculado, status e expiração |
| `AlanLorenz-Transacoes` | `intentionId` | — | Uma transação por intenção; `transactionId` fica como atributo do item |

As tabelas usam cobrança sob demanda com limite de throughput configurado para
5 unidades de leitura e escrita por segundo. Esse limite reduz picos de
throughput, mas **não é um teto de gasto mensal**. Não foram habilitados TTL
nem índices secundários: intenções expiradas precisam continuar disponíveis
para que a ferramenta possa responder `INTENCAO_EXPIRADA`, e os índices
adicionariam custo sem serem necessários para os acessos atuais.

O perfil de um usuário Cognito é criado na primeira intenção, com o limite
inicial legado de R$ 1.000,00 (`100000` centavos). O catálogo inicial é o mesmo
do chatbot da Fase 1; não são migrados usuários, conversas ou compras do
SQLite.

As ferramentas recebem o `sub` validado do Cognito em um campo de contexto
separado dos argumentos do modelo. O runtime Strands deve injetar esse contexto
confiável; nunca aceite `userId` vindo dos argumentos do modelo.

## Validar localmente

No PowerShell, a partir desta pasta:

```powershell
npm ci
npm run build
npm test -- --runInBand
npx cdk synth
```

Esses comandos constroem, testam e sintetizam a stack localmente; **não fazem
deploy**. A síntese inclui `UserPoolId`, `UserPoolClientId` e `ChatApiEndpoint`
como outputs, para configurar o frontend local quando a integração estiver
pronta. Para testar as ferramentas localmente, use também `npm run check` na
pasta `../tools/`.

Depois de um deploy autorizado, o catálogo pode ser inserido sem sobrescrever
estoque existente. Na pasta `../tools/`, configure `PRODUCTS_TABLE` com o nome
`AlanLorenz-Produtos` e execute `npm run seed:catalog`. Esse comando grava no
DynamoDB; não o execute como parte dos testes locais.

Não execute `cdk deploy` sem autorização da coordenação. Não houve deploy
durante o desenvolvimento desta etapa.
