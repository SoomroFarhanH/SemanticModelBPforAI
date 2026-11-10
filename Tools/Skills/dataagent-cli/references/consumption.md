<!-- Topic reference for the `dataagent-cli` skill. Loaded on demand from `management.md` and `evaluation.md` when a published agent is consumed or smoke-tested. -->

# Consumption — call a published agent (MCP, SDK, Microsoft 365 Copilot)

Sources: [data agent as MCP server](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-mcp-server) · [SDK](https://learn.microsoft.com/en-us/fabric/data-science/fabric-data-agent-sdk) · [concepts](https://learn.microsoft.com/en-us/fabric/data-science/concept-data-agent).

Read-only for the agent definition. Consumers only ever see the **published** stage; a draft change is invisible until it is published (`management.md`).

## Channels

| Channel | How | Automatable here |
|---|---|---|
| Fabric portal chat | Open the agent; draft and published views | no (manual check) |
| **MCP server** | `https://api.fabric.microsoft.com/v1/mcp/workspaces/{ws}/dataagents/{agentId}/agent` (streamable HTTP) | yes |
| SDK / Responses API | `fabric-data-agent-sdk`; querying moved from the Assistants API to the Responses API; MCP is the client-neutral alternative | yes (notebook or configured credential) |
| Microsoft 365 Copilot | Publish to the agent store from the portal (or a Fabric notebook); not exposed in the public REST API | no — guide the user |
| Copilot Studio, Azure AI Foundry, Teams | Add the published agent as a connected agent / tool in that product | no — guide the user |

## MCP server facts

- Works **only after publish**; an unpublished agent returns an error even with a correct URL.
- Exposes **one tool** that represents the agent. The **publishing description becomes the tool description**, and orchestrators use it to decide when to call the agent: write it specifically (domain, sources, typical questions, what it does not answer).
- Server name, URL, tool name and tool description are on **Settings → Model Context Protocol**; `mcp.json` for VS Code-style clients can be downloaded there.
- Auth: a bearer token for scope `https://api.fabric.microsoft.com/.default`, user or service principal; the agent runs with **that identity's** data permissions. No dynamic client registration or client identity metadata: the client must obtain the token itself.
- Protocol: `initialize` → `tools/list` → `tools/call`. A plain REST call without the handshake does not work.
- Long questions: clients that support the `io.modelcontextprotocol/tasks` extension receive a task; poll `tasks/get`, stop with `tasks/cancel` (cancellation is not instant).
- **Compliance:** answers returned through an MCP client may leave Fabric's compliance boundary or region and are governed by that client's terms. Tell the user before wiring the agent into a third-party client.

## Python client (smoke test)

`pip install mcp azure-identity` (Python 3.10+). Discover the tool and its argument name instead of hard-coding them.

```python
import asyncio
from azure.identity import AzureCliCredential           # unattended: ClientSecretCredential / ManagedIdentityCredential
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

URL = f"https://api.fabric.microsoft.com/v1/mcp/workspaces/{WS}/dataagents/{AGENT_ID}/agent"
cred = AzureCliCredential()

async def ask(question):
    headers = {"Authorization": "Bearer " + cred.get_token("https://api.fabric.microsoft.com/.default").token,
               "x-ms-fabric-skill": "dataagent-cli"}
    async with streamablehttp_client(URL, headers=headers) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tool = (await session.list_tools()).tools[0]            # single tool = the agent
            arg = next(iter(tool.inputSchema["properties"]))        # question argument name
            result = await session.call_tool(tool.name, {arg: question})
            return tool.description, "\n".join(b.text for b in result.content if b.type == "text")

for q in SMOKE_QUESTIONS:                                         # 3-5 benchmark questions
    desc, answer = asyncio.run(ask(q))
    print(q, "->", answer[:500])
```

Check: the tool description equals the intended publishing description; each answer is grounded and matches the expected answer; a user without data access gets a permission-limited answer, not data. Never log tokens.

## VS Code

Create `.vscode/mcp.json` (or use the downloaded file) with an HTTP server pointing at the URL above; VS Code prompts for sign-in. Use this for interactive checks only.

## Governance reminders

- Sharing the agent does not grant data access; RLS/CLS and item permissions of the caller apply (`management.md`).
- Purview DLP, Insider Risk Management, Audit and DSPM for AI apply to agent interactions; instruction precedence is organizational > role-based > developer (agent instructions) > user.
- The published agent keeps the **runtime it had at publish time**; switching the draft to or from the preview runtime affects consumers only after republishing.
