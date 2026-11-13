type ChatApiEvent = {
  requestContext?: {
    authorizer?: {
      jwt?: {
        claims?: Record<string, unknown>;
      };
    };
  };
};

function jsonResponse(statusCode: number, error: string) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ error }),
  };
}

export async function handler(event: ChatApiEvent) {
  const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;
  if (typeof userId !== 'string' || !userId.trim()) {
    return jsonResponse(401, 'UNAUTHENTICATED_USER');
  }

  return jsonResponse(501, 'AGENT_NOT_IMPLEMENTED');
}
