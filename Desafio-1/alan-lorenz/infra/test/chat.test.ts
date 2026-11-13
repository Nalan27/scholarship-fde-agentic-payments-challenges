import { handler } from '../lambda/chat';

describe('chat handler authentication guard', () => {
  test('rejects events without an authenticated Cognito subject', async () => {
    const response = await handler({});

    expect(response.statusCode).toBe(401);
    expect(response.body).toBe(JSON.stringify({ error: 'UNAUTHENTICATED_USER' }));
  });

  test('returns an explicit not-implemented response for authenticated users', async () => {
    const response = await handler({
      requestContext: {
        authorizer: {
          jwt: {
            claims: { sub: 'cognito-user-id' },
          },
        },
      },
    });

    expect(response.statusCode).toBe(501);
    expect(response.body).toBe(JSON.stringify({ error: 'AGENT_NOT_IMPLEMENTED' }));
  });
});
