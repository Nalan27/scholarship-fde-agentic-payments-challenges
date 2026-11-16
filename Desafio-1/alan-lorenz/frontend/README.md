# Frontend do chatbot

Frontend estático do chatbot da Fase 1, usando Cognito para autenticação e
AWS Amplify para gerenciar a sessão. O navegador envia o ID token como
`Authorization: Bearer <JWT>` à API protegida. A interface mantém o fluxo de
conversa e o histórico de chamadas/resultados das ferramentas.

## Desenvolvimento local

Requer Node.js/npm. Copie `.env.example` para `.env.local` e preencha as
variáveis com os outputs da stack CDK:

- `NEXT_PUBLIC_USER_POOL_ID`: output `UserPoolId`
- `NEXT_PUBLIC_USER_POOL_CLIENT_ID`: output `UserPoolClientId`
- `NEXT_PUBLIC_CHAT_API_URL`: output `ChatApiEndpoint`

```powershell
npm ci
npm run dev
```

O frontend usa `http://localhost:3000`; a API aceita esse origin para CORS.
As contas não podem ser criadas pela interface: a coordenação precisa
provisionar o usuário no Cognito e enviar o convite. No primeiro login, a
interface permite definir uma nova senha para a senha temporária.

## Build estático para S3 + CloudFront

O `next.config.ts` usa `output: 'export'`. O `npm run build` gera o site em
`out/`. Durante o deploy da stack CDK, `BucketDeployment` publica esse
diretório no bucket privado e cria `config.json` com os IDs e URL da API
resolvidos pela própria stack. Assim, os valores da AWS não precisam ser
conhecidos para criar o build estático e nenhum segredo é empacotado.

Não é necessário definir `FRONTEND_BUILD_PATH` para o fluxo normal: a stack
usa `frontend/out/` dentro deste projeto. Os comandos `npm run synth` e
`npm run deploy` da pasta `infra/` instalam dependências, executam os checks e
geram o build automaticamente. Consulte [`../infra/README.md`](../infra/README.md)
para validação e deploy. O build e a síntese não publicam recursos nem chamam
o modelo Bedrock.
