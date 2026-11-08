<!-- Mode reference for the `dataagent-cli` skill. Loaded on demand from `skills/dataagent-cli/SKILL.md` when the request matches the `management` mode. -->

# Management — operate the data agent item

Moves and operates the item; it does not invent configuration content (that is `authoring`). Sources: [sharing and permissions](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-sharing) · [concepts: ALM and DevOps](https://learn.microsoft.com/en-us/fabric/data-science/concept-data-agent) · [SDK](https://learn.microsoft.com/en-us/fabric/data-science/fabric-data-agent-sdk).

Helper functions (`request`, `lro`, `get_definition`, `update_definition`, `to_parts`) are defined in [authoring.md](authoring.md); open that file once if you need them.

## Operations

| Operation | How | Status |
|---|---|---|
| List agents | `GET /v1/workspaces/{ws}/items?type=DataAgent` (follow `continuationUri`) | verified |
| Get one | `GET /v1/workspaces/{ws}/items/{id}` | verified |
| Export (backup) | `POST /v1/workspaces/{ws}/items/{id}/getDefinition` → poll `Location` → `GET {Location}/result`; decode every part into `before/<UTC stamp>/` keeping paths | verified |
| Restore / rollback | `POST .../updateDefinition` with **exactly** the parts from the backup (full replace; this also removes a `fewshots.json` that did not exist then) | verified |
| Create | `POST /v1/workspaces/{ws}/items` type `DataAgent` with a definition, or the SDK (`authoring.md`) | verified (lakehouse source) |
| Update description/name only | `PATCH /v1/workspaces/{ws}/items/{id}` (`displayName`, `description`) | standard Fabric item API; confirm by readback |
| Delete | `DELETE /v1/workspaces/{ws}/items/{id}` | standard Fabric item API; **only on explicit user request**, after a backup |
| Publish | portal (**Publish** with a description), or SDK `agent.publish_staging(description="...")` | documented; **only on explicit request** |
| Sharing, M365 Copilot publishing | portal | documented; not automated here |

Run every backup before any write. Save the backup path in the run folder and tell the user.

## Rollback procedure

1. Export the current definition (so the rollback is itself reversible).
2. `updateDefinition` with exactly the backup's parts.
3. Re-export and compare to the backup (ignore `.platform` display noise). Report the result.
Source-side changes (lakehouse comments, Prep for AI) roll back in their own items.

## Publish checklist (when the user asks to publish)

1. `evaluation.md` completed; blockers addressed or accepted by the owner (preview runtime accepted in writing if used).
2. Backup of the draft taken.
3. A **specific publishing description** (what the agent does, which sources and questions it covers): it is shown to consumers and used by automated systems and orchestrators (MCP clients, Microsoft 365 Copilot, Copilot Studio) to decide when to call the agent.
4. Publish via the portal or SDK; export again and confirm `published/` now matches the intended draft and `publish_info.json` carries the description.
5. After publishing you can keep editing the draft without affecting the published version; compare both with the same questions (`evaluation.md`).

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

Purview DLP/access-restriction policies can block queries or give incomplete answers; Purview Audit/eDiscovery may log interactions. Do not change permissions or tenant settings from this skill; report what is missing.

## ALM

- **Git integration** versions the same definition parts (instructions, examples, selection); use `git-integration-operations-cli` to connect, commit and sync.
- **Deployment pipelines** promote agents between workspaces (dev → test → prod); use `deployment-pipelines-authoring-cli`. Source item IDs inside `datasource.json` are workspace-specific: after promotion confirm each source still resolves in the target workspace (same-region capacity rule applies).
- Source item IDs inside `datasource.json` are workspace-specific; never hard-code production IDs in shared files, and re-bind sources per environment, confirming by readback.

## Gotchas

- `CapacityNotActive`: stop and report; do not resume capacity.
- Honor `Retry-After` on 429; re-acquire tokens in long polls; capture the `Location` header of every LRO immediately.
- Never edit `published/` parts to "publish" by hand; the supported ways are the portal and the SDK.
- Deleting an agent does not delete its sources, and sources are not changed by publishing.
