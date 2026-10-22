---
name: fabric-data-agent
description: >
  Call a published Fabric data agent from a Universal App through a Rayfin
  function using application auth and MCP streamable HTTP.
  Use when the request names a Fabric data agent, data-agent MCP endpoint, or
  asks to chat with governed Fabric data through an app.
---

# Fabric data agent

Use a Rayfin function so the Fabric access token remains server-side.
Read `functions-capability` and apply its pack before implementing this
workflow.

## Required input

Obtain the published data-agent MCP endpoint.
Do not substitute the legacy OpenAI-style endpoint.
The published endpoint has this shape:

```text
https://api.fabric.microsoft.com/v1/mcp/workspaces/{workspaceId}/dataagents/{dataAgentId}/agent
```

Use `ctx.Tokens.Fabric`, not an API key or service-principal secret.

## Fabric access token

Import the Fabric audience and context from the functions runtime:

```ts
import {
  AudienceType,
  UserDataFunctions,
  type RayfinContext,
} from '@microsoft/fabric-user-data-functions';

const udf = new UserDataFunctions();

udf.func(
  'askFabricDataAgent',
  async (
    ctx: RayfinContext<AppSchema, AudienceType.Fabric>,
    question: string
  ): Promise<DataAgentResult> => {
    const token: string = ctx.Tokens.Fabric;
    // Perform the MCP exchange and return only the bounded result.
  },
  [] // the audience in the annotation is the declaration
);
```

The audience union on the context annotation is what registers the connection —
declare it there, written literally as `AudienceType.Fabric`, and read the token
as `ctx.Tokens.Fabric`.
Requesting an audience the annotation does not declare is a compile error.
`ctx.getToken(...)` is deprecated and flagged by
`@typescript-eslint/no-deprecated`.

Send the token only in the server-side `Authorization: Bearer <token>` header.
Never return it to the browser or write it to application logs.
The deployed function accesses the data agent using the app identity's permissions.

## MCP exchange

The function performs this sequence:

1. Send `initialize`.
2. Send `notifications/initialized`.
3. Call `tools/list`.
4. Discover the advertised tool and its question argument.
5. Call `tools/call`.

Treat `Mcp-Session-Id` as optional.
Forward it when supplied, but do not fail initialization when it is absent.

Parse successful bodies according to their content type.
Support JSON and server-sent events for JSON-RPC responses.
Accept a non-JSON acknowledgement such as plain-text `Accepted` without trying
to parse it as JSON.

Use
[`references/mcp-streamable-http.md`](references/mcp-streamable-http.md)
as the reusable transport reference.
Copy and adapt the helper into the functions source only for a data-agent
scenario.
The general functions pack deliberately does not seed MCP code into every app.

Bound the question and the answer returned to the browser.
Do not log questions, answers, bearer tokens, provider bodies, or sensitive
exceptions.

## Long-running behavior

The function's outbound MCP deadline and the browser's wait for the function
invocation are independent.
Both must accommodate the operation.

Show a visible progress state explaining that a data-agent response may take up
to 10 minutes.
The current frontend SDK has a client-wide timeout rather than a
per-invocation timeout.
Do not make an extended timeout the default for every app operation.
If needed, isolate the workaround to a dedicated data-agent client and document
that the full platform execution duration remains to be verified.

Do not return from the UDF and expect work to continue in the background.
The current MCP `tools/call` is one awaited request.
A start-and-poll design requires a durable operation ID from the downstream
service or an app-owned queue, worker, and result store.
