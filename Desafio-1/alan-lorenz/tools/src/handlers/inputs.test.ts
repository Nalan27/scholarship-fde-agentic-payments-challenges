import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createToolHandlers } from './inputs.ts';
import type { PaymentStore, ToolAuditRecord } from '../types.ts';

const VALID_CONTEXT = {
  authenticatedContext: {
    userId: 'cognito-sub-from-jwt',
    conversaId: '3f1a9c2e-7b48-4d6a-9f01-2c5e8a4b7d13',
  },
  arguments: {},
};

function hasProducts(value: unknown): value is { produtos: unknown[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'produtos' in value &&
    Array.isArray(value.produtos)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unusedStore(): PaymentStore {
  const unexpected = () => Promise.reject(new Error('store should not be called'));
  return {
    listProducts: unexpected,
    getProduct: unexpected,
    getIntention: unexpected,
    getUser: unexpected,
    ensureUser: unexpected,
    putIntention: unexpected,
    cancelIntention: unexpected,
    completePurchase: unexpected,
    recordToolCall: unexpected,
  };
}

test('tool handlers require authenticated identity separate from model arguments', async () => {
  const handlers = createToolHandlers(unusedStore());
  await assert.rejects(handlers.listar_catalogo({ arguments: {} }), /Authenticated tool context/);
  await assert.rejects(
    handlers.listar_catalogo({
      authenticatedContext: { userId: '', conversaId: VALID_CONTEXT.authenticatedContext.conversaId },
      arguments: {},
    }),
    /Authenticated user id/,
  );
  await assert.rejects(
    handlers.listar_catalogo({
      authenticatedContext: { ...VALID_CONTEXT.authenticatedContext, conversaId: 'conversation-1' },
      arguments: {},
    }),
    /UUID v4/,
  );
});

test('model arguments cannot replace the authenticated user recorded for a tool call', async () => {
  const auditRecords: ToolAuditRecord[] = [];
  const store: PaymentStore = {
    ...unusedStore(),
    listProducts: async () => [
      {
        id: 'prod_001',
        nome: 'Fone Bluetooth',
        preco_cents: 24990,
        moeda: 'BRL',
        estoque: 20,
        categoria: 'audio',
      },
    ],
    recordToolCall: async (record) => {
      auditRecords.push(record);
    },
  };
  const handlers = createToolHandlers(store);

  const result = await handlers.listar_catalogo({
    authenticatedContext: VALID_CONTEXT.authenticatedContext,
    arguments: { userId: 'model-supplied-user', categoria: 'audio' },
  });

  assert.ok(hasProducts(result));
  assert.equal(result.produtos.length, 1);
  assert.equal(auditRecords[0]?.userId, 'cognito-sub-from-jwt');
  const recordedArguments = auditRecords[0]?.arguments;
  assert.ok(isRecord(recordedArguments));
  assert.equal(recordedArguments.userId, 'model-supplied-user');
  assert.equal(auditRecords[0]?.outcome, 'consultado');
});
