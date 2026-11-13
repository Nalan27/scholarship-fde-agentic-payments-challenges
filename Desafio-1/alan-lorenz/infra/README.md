# Infraestrutura do desafio

Este pacote define a infraestrutura AWS com CDK em TypeScript. O escopo
aprovado no momento é somente o backend: não implante frontend, S3 ou
CloudFront até nova orientação da coordenação. A stack está configurada para
`us-east-1`.

## Estado atual

- Cinco tabelas DynamoDB para produtos, usuários, conversas, intenções e
  transações.
- User Pool do Cognito sem auto cadastro, com login por e-mail e recuperação
  de conta por e-mail. A criação de usuários deve ser administrativa.
- App client público para o frontend local, com autenticação SRP e sem OAuth
  nem segredo.
- HTTP API com JWT authorizer Cognito como autorização padrão. CORS permite
  somente `http://localhost:3000`.
- A rota `POST /chat` chama uma Lambda temporária. Ela exige o `sub` fornecido
  pelo authorizer e responde `501 AGENT_NOT_IMPLEMENTED` para usuários
  autenticados; a integração com o agente ainda não foi feita.
- Logs da Lambda são retidos por uma semana e o papel da função só pode
  escrever no grupo de logs dela.

## Modelo de dados DynamoDB

| Tabela | Chave de partição | Chave de ordenação | Uso |
|---|---|---|---|
| `AlanLorenz-Produtos` | `id` | — | Catálogo, preço em centavos e estoque |
| `AlanLorenz-Usuarios` | `userId` | — | `sub` do Cognito e limite restante em centavos |
| `AlanLorenz-Conversas` | `userId` | `messageKey` | Uma mensagem por item; `messageKey` usa `<conversaId>#<sequência>` |
| `AlanLorenz-Intencoes` | `intentionId` | — | Proprietário, conversa, total calculado, status e expiração |
| `AlanLorenz-Transacoes` | `intentionId` | — | Uma transação por intenção; `transactionId` fica como atributo do item |

As tabelas usam cobrança sob demanda com limite de throughput configurado para
5 unidades de leitura e escrita por segundo. Esse limite reduz picos de
throughput, mas **não é um teto de gasto mensal**. Não foram habilitados TTL
nem índices secundários: intenções expiradas precisam continuar disponíveis
para que a ferramenta possa responder `INTENCAO_EXPIRADA`, e os índices
adicionariam custo sem serem necessários para os acessos atuais.

Na implementação das ferramentas, a compra deverá usar uma transação do
DynamoDB que condicione a intenção a estar pendente, debite o limite restante,
atualize o estoque e grave a transação atomicamente. O backend deverá usar o
`sub` validado do Cognito como `userId`; nunca deve aceitar esse valor do modelo
ou do corpo da requisição.

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
pronta. Não execute `cdk deploy` sem autorização da coordenação.
