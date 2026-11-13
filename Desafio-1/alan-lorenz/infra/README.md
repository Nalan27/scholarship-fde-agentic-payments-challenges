# Infraestrutura do desafio

Este pacote contém a infraestrutura AWS do desafio, definida com AWS CDK em
TypeScript. O escopo atual é somente backend; frontend/S3/CloudFront ficam
fora da stack até nova orientação da coordenação.

## Autenticação e API

O User Pool do Cognito não permite auto cadastro e envia convites por e-mail.
O app client é público (sem segredo e sem OAuth) para uso pelo frontend local. A HTTP API
usa esse User Pool como JWT authorizer padrão; a rota `POST /chat` não chega à
Lambda sem um token válido. Durante o desenvolvimento local, o CORS aceita
somente `http://localhost:3000`.

A Lambda temporária da rota está em `lambda/chat.ts`. Ela valida que o `sub` autenticado
está presente e, até a integração com o agente, retorna explicitamente
`501 AGENT_NOT_IMPLEMENTED`.
O log dessa Lambda é apagado após uma semana; o papel da função só pode
escrever nesse grupo.

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

## Comandos locais

```powershell
npm run build
npm test -- --runInBand
npx cdk synth
```

Esses comandos validam e sintetizam a stack localmente; não fazem deploy.
O `cdk synth` também imprime `UserPoolId`, `UserPoolClientId` e
`ChatApiEndpoint` como outputs, para configurar o frontend local depois.
