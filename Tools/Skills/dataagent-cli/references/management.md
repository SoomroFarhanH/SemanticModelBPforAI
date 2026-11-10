<!-- Mode reference for the `dataagent-cli` skill. Loaded on demand from `skills/dataagent-cli/SKILL.md` when the request matches the `management` mode. -->

# Management — operate the data agent item

Moves and operates the item; it does not invent configuration content (that is `authoring`). Sources: [sharing and permissions](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-sharing) · [concepts: ALM and DevOps](https://learn.microsoft.com/en-us/fabric/data-science/concept-data-agent) · [SDK](https://learn.microsoft.com/en-us/fabric/data-science/fabric-data-agent-sdk).

Helper functions (`request`, `lro`, `get_definition`, `update_definition`, `to_parts`) are defined in [authoring.md](authoring.md); open that file once if you need them.

## Operations

| Operation | How | Status |
|---|---|---|
| List agents | `GET /v1/workspaces/{ws}/items?type=DataAgent` or `GET /v1/workspaces/{ws}/dataAgents` (follow `continuationUri`) | verified (items) / documented |
| Get one | `GET /v1/workspaces/{ws}/items/{id}` or `GET /v1/workspaces/{ws}/dataAgents/{id}` (adds `properties.publishedDescription` once published) | verified (items) / documented |
| Compare draft vs published | `GET .../dataAgents/{id}/staging/settings` vs `GET .../dataAgents/{id}/settings` (same for `datasources`, `fewshots`, `elements`, `topics`) | documented, preview |
| Export (backup) | `POST /v1/workspaces/{ws}/items/{id}/getDefinition` → poll `Location` → `GET {Location}/result`; decode every part into `before/<UTC stamp>/` keeping paths | verified |
| Restore / rollback | `POST .../updateDefinition` with **exactly** the parts from the backup (full replace; this also removes a `fewshots.json` that did not exist then) | verified |
| Create | `POST /v1/workspaces/{ws}/dataAgents` (`displayName`, optional `description` ≤ 256 chars, `folderId`, `definition`), `POST /v1/workspaces/{ws}/items` type `DataAgent` with a definition, or the SDK (`authoring.md`) | verified (items + lakehouse) / documented |
| Update description/name only | `PATCH /v1/workspaces/{ws}/dataAgents/{id}` or `.../items/{id}` (`displayName`, `description`) | documented; confirm by readback |
| Delete | `DELETE /v1/workspaces/{ws}/dataAgents/{id}` (or `.../items/{id}`) | documented; **only on explicit user request**, after a backup |
| Discard draft changes | `POST /v1/workspaces/{ws}/dataAgents/{id}/staging/reset` — reverts the draft to the published configuration | documented, preview; **only on explicit request**, after a backup |
| Publish | `POST /v1/workspaces/{ws}/dataAgents/{id}/staging/publish` body `{"publishedDescription": "..."}` → 200 `{publishedDescription}`; or SDK `agent.publish_staging(description="...")`; or the portal | documented, preview; **only on explicit request** |
| Consume (MCP, SDK) | `https://api.fabric.microsoft.com/v1/mcp/workspaces/{ws}/dataagents/{id}/agent` — see [consumption.md](consumption.md) | documented; published agents only |
| Sharing, Microsoft 365 Copilot publishing | portal (Microsoft 365 Copilot publishing is not in the public REST API) | documented; not automated here |

Run every backup before any write. Save the backup path in the run folder and tell the user.

## Rollback procedure

1. Export the current definition (so the rollback is itself reversible).
2. `updateDefinition` with exactly the backup's parts.
3. Re-export and compare to the backup (ignore `.platform` display noise). Report the result.
Source-side changes (lakehouse comments, Prep for AI) roll back in their own items.

## Publish checklist (when the user asks to publish)

1. `evaluation.md` completed and [preflight-checklist.md](preflight-checklist.md) sections A–H have no open `FAIL` (or each is accepted by the owner; preview runtime accepted in writing if used).
2. Backup of the draft taken.
3. A **specific publishing description** (what the agent does, which sources and questions it covers, what it does not answer): it is shown to consumers, becomes the **MCP tool description**, and is used by orchestrators (MCP clients, Microsoft 365 Copilot, Copilot Studio) to decide when to call the agent.
4. Publish via REST (`staging/publish`), SDK or portal. The published agent keeps the runtime (standard or preview) it had at publish time; to change it for consumers, change the draft and republish.
5. Export again and confirm `published/` now matches the intended draft and `publish_info.json` carries the description; then run the MCP smoke test ([consumption.md](consumption.md), `evaluation.md` section 3, step 5).
6. After publishing you can keep editing the draft without affecting the published version; compare both with the same questions (`evaluation.md`). To abandon draft edits, use `staging/reset` (explicit request, after a backup).

## Permissions and sharing

The agent runs with **the caller's identity**; sharing it does not grant data access. Users need, per source:

| Source | Minimum to query via the agent |
|---|---|
| Semantic model | **Read** on the model (no workspace access; RLS/CLS apply) |
| Lakehouse | Read on the lakehouse item (and table access if enforced) |
| Warehouse | Read / `SELECT` on the relevant tables |
| KQL database | **Reader** role on the database |
| Ontology | Read on the ontology and on its underlying sources |
| Azure AI Search | Role-based access: Search Index Data Reader (and Contributor for the connecting identity) |

Purview DLP/access-restriction policies can block queries or give incomplete answers; Purview Audit/eDiscovery may log interactions. When guidance conflicts, precedence is organizational > role-based > developer (agent instructions) > user. Do not change permissions or tenant settings from this skill; report what is missing.

The DataAgent REST APIs need `Item.ReadWrite.All` or `DataAgent.ReadWrite.All` for writes (`...Read.All` for reads) and read/write permission on the agent; topic upload/delete need contributor. Users, service principals and managed identities are supported, so CI/CD can publish with a service principal.

## ALM

- **Git integration** versions the same definition parts (instructions, examples, selection); use `git-integration-operations-cli` to connect, commit and sync.
- **Deployment pipelines** promote agents between workspaces (dev → test → prod); use `deployment-pipelines-authoring-cli`. Source item IDs inside `datasource.json` are workspace-specific: after promotion confirm each source still resolves in the target workspace (same-region capacity rule applies).
- Source item IDs inside `datasource.json` are workspace-specific; never hard-code production IDs in shared files, and re-bind sources per environment, confirming by readback. The staging datasource API also accepts a variable-library reference (`{"referenceType": "ByVariable", "variableReference": "$(/**/<VarLibrary>/<VarName>)"}`), which lets each stage resolve its own source.

## Gotchas

- `CapacityNotActive`: stop and report; do not resume capacity.
- Honor `Retry-After` on 429; re-acquire tokens in long polls; capture the `Location` header of every LRO immediately.
- Never edit `published/` parts to "publish" by hand; the supported ways are `staging/publish`, the SDK and the portal.
- `staging/reset` discards **all** unpublished draft changes; it is not a per-change undo. Prefer restoring a backup when only some changes must go.
- The MCP endpoint errors until the agent is published; publishing a new version changes what MCP clients see immediately.
- Deleting an agent does not delete its sources, and sources are not changed by publishing.
