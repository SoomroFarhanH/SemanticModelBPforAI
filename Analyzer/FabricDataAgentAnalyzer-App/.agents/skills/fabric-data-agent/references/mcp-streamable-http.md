# MCP streamable HTTP reference

Use this transport shape for a published Fabric data-agent endpoint.
Keep the endpoint and token as function inputs to the helper rather than
hard-coding either value.

```ts
type JsonRpcResponse = {
  id?: number;
  result?: unknown;
  error?: { code?: number; message?: string };
};

type McpResponse = {
  responseStatus: number;
  sessionId: string | null;
  body: JsonRpcResponse | null;
};

function parseJsonRpcResponse(text: string): JsonRpcResponse | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const dataLines = trimmed
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim());
  const payload = dataLines.at(-1) ?? trimmed;
  const parsed: unknown = JSON.parse(payload);

  return parsed && typeof parsed === 'object'
    ? (parsed as JsonRpcResponse)
    : null;
}

async function postMcpRequest(
  endpoint: string,
  token: string,
  payload: Record<string, unknown>,
  signal: AbortSignal,
  sessionId?: string
): Promise<McpResponse> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': '2025-03-26',
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
    },
    body: JSON.stringify(payload),
    signal,
  });

  const responseSessionId = response.headers.get('mcp-session-id');
  if (!response.ok) {
    return {
      responseStatus: response.status,
      sessionId: responseSessionId,
      body: null,
    };
  }

  const contentType =
    response.headers.get('content-type')?.toLowerCase() ?? '';
  const isJsonRpc =
    contentType.includes('application/json') ||
    contentType.includes('text/event-stream');
  const text = await response.text();

  return {
    responseStatus: response.status,
    sessionId: responseSessionId,
    body: isJsonRpc ? parseJsonRpcResponse(text) : null,
  };
}
```

Call it with a bounded outbound deadline:

```ts
const signal = AbortSignal.timeout(600_000);
```

Perform `initialize`, `notifications/initialized`, `tools/list`, and
`tools/call` in that order.
Use the session header returned by `initialize` when present.
Do not require it.

Validate the JSON-RPC result at every stage.
Discover the advertised tool name and question argument rather than hard-coding
them.
Extract only text content from the final result and bound its length before
returning it.

Do not add request, response, token, question, or answer logging to this helper.
