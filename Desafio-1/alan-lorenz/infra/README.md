# Infraestrutura do desafio

Este pacote contém a infraestrutura AWS do desafio, definida com AWS CDK em
TypeScript. O escopo atual é somente backend; frontend/S3/CloudFront ficam
fora da stack até nova orientação da coordenação.

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
