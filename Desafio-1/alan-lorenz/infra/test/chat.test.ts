import { PassThrough, Readable } from 'node:stream';
import {
  createRuntimeSessionId,
  forwardAgentEvent,
  parseRequest,
  readAgentEvents,
} from '../../api/chat';

const conversaId = 'c3ad9981-cd4c-4a01-9a7a-f7248173ad19';

describe('chat request validation', () => {
  test('rejects events without an authenticated Cognito subject', () => {
    expect(parseRequest({})).toEqual({
      statusCode: 401,
      error: 'UNAUTHENTICATED_USER',
    });
  });

  test('uses the Cognito subject and ignores client-supplied identity', () => {
    const parsed = parseRequest({
      requestContext: {
        authorizer: {
          claims: { sub: 'trusted-cognito-sub' },
        },
      },
      body: JSON.stringify({
        userId: 'untrusted-client-value',
        conversaId,
        messages: [{ role: 'user', content: 'Olá' }],
      }),
    });

    expect('request' in parsed).toBe(true);
    if ('request' in parsed) {
      expect(parsed.request.userId).toBe('trusted-cognito-sub');
      expect(parsed.request.conversaId).toBe(conversaId);
    }
  });

  test('requires a valid conversation id and non-empty user history', () => {
    const event = {
      requestContext: {
        authorizer: { claims: { sub: 'trusted-cognito-sub' } },
      },
      body: JSON.stringify({
        conversaId: 'not-a-uuid',
        messages: [{ role: 'user', content: 'Olá' }],
      }),
    };

    expect(parseRequest(event)).toEqual({
      statusCode: 400,
      error: 'INVALID_CONVERSATION_ID',
    });
  });

  test('isolates runtime sessions by authenticated user and conversation', () => {
    const first = createRuntimeSessionId('user-one', conversaId);
    expect(first).toHaveLength(64);
    expect(createRuntimeSessionId('user-one', conversaId)).toBe(first);
    expect(createRuntimeSessionId('user-two', conversaId)).not.toBe(first);
  });
});

describe('AgentCore SSE parsing', () => {
  test('decodes events across chunk boundaries, including split UTF-8 characters', async () => {
    const chunks = [
      Buffer.from('data: {"type":"token","text":"Ol'),
      Buffer.from('á"}\r\n\r\n'),
      Buffer.from('data: {"type":"done"}\n\n'),
    ];
    const events: unknown[] = [];

    for await (const event of readAgentEvents(Readable.from(chunks))) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'token', text: 'Olá' },
      { type: 'done' },
    ]);
  });

  test('converts agent events into the existing chat UI NDJSON shape', async () => {
    const stream = new PassThrough();
    const chunks: string[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk.toString('utf8')));
    const output = new Promise<string>((resolve) => {
      stream.on('end', () => resolve(chunks.join('')));
    });

    forwardAgentEvent(stream, { type: 'token', text: 'Olá' });
    forwardAgentEvent(stream, {
      type: 'tool',
      name: 'listar_catalogo',
      arguments: {},
      result: { produtos: [] },
    });
    stream.end();

    await expect(output).resolves.toBe(
      '{"message":{"role":"assistant","content":"Olá"}}\n' +
        '{"tool":{"name":"listar_catalogo","arguments":{},"result":{"produtos":[]}}}\n',
    );
  });
});
