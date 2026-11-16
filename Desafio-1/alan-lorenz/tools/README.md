# Ferramentas de pagamento

Este pacote porta para TypeScript as três ferramentas do chatbot da Fase 1:
`listar_catalogo`, `registrar_intencao` e `realizar_compra`. Preserva o formato
de resposta e as regras existentes, substituindo SQLite por DynamoDB. As
funções ainda precisam ser conectadas ao agente Strands no Bedrock AgentCore.

## Regras preservadas

- Preços e limites são calculados em centavos no backend.
- Intenções pertencem ao `sub` do usuário Cognito e ao UUID v4 da conversa,
  expiram em cinco minutos e não reservam estoque.
- O limite inicial de usuários novos é R$ 1.000,00. A compra reduz o saldo
  restante no item do usuário.
- Compra valida intenção, proprietário, conversa, expiração, método, limite e
  estoque. As atualizações de intenção, limite, estoque e transação ocorrem
  em uma única transação condicional DynamoDB.
- Cada chamada de ferramenta, inclusive recusas, é auditada na tabela de
  conversas. Falha de auditoria é registrada em stderr e não desfaz uma compra
  já confirmada.
- O contexto autenticado (`userId` e `conversaId`) é separado dos argumentos
  fornecidos pelo modelo. O runtime Strands deve injetá-lo; nunca aceite
  `userId` dos argumentos da ferramenta.

O catálogo inicial está em `src/catalog.ts` e corresponde aos cinco produtos
do chatbot anterior. Não são migrados dados de usuários, conversas ou compras
do SQLite.

## Validar localmente

Na pasta `tools/`, execute:

```powershell
npm ci
npm run check
```

Os testes usam um armazenamento em memória e mocks do SDK; não acessam a AWS.

Após deploy autorizado da stack, configure `PRODUCTS_TABLE` como
`AlanLorenz-Produtos` e execute `npm run seed:catalog` para inserir o catálogo.
O comando escreve no DynamoDB e não faz parte da validação local.
