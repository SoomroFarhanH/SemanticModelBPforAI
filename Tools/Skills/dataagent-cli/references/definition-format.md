<!-- Topic reference for the `dataagent-cli` skill. Loaded on demand from `authoring.md` and `management.md`. -->

# Data agent definition format

The data agent item is stored as a set of parts (the Git/item-definition format). `getDefinition` returns them; `updateDefinition` and item creation accept them. Official format: [Data agent definition](https://learn.microsoft.com/en-us/rest/api/fabric/articles/item-management/definitions/data-agent-definition).

## Parts

Paths are capitalized and exact (`Files/Config/...`). Each part is `{"path", "payload" (base64 UTF-8), "payloadType": "InlineBase64"}`.

| Path | Required | Holds |
|---|---|---|
| `Files/Config/data_agent.json` | yes | `$schema` (dataAgent 2.1.0). Do not edit |
| `Files/Config/draft/stage_config.json` | yes | `aiInstructions` (**agent-level instructions**), `experimental.enableExperimentalFeatures` (**preview runtime marker**) |
| `Files/Config/draft/<type>-<name>/datasource.json` | one per source | `artifactId`, `workspaceId`, `displayName`, `type`, `userDescription` (**source description**), `dataSourceInstructions` (**source instructions**), `elements[]` (schema selection and object descriptions) |
| `Files/Config/draft/<type>-<name>/fewshots.json` | optional | `{"$schema": "1.0.0", "fewShots": [{"id": uuid, "question", "query"}]}` |
| `Files/Config/published/...` | after publish | Same files for the published stage. **Read-only for this skill** |
| `Files/Config/publish_info.json` | yes | `description` set at publish time |
| `.platform` | yes | item type and display name |

Observed folder names follow the export: `lakehouse-tables-<name>`, `semantic-model-<name>`. When adding a source by hand, copy the folder-naming pattern and `type` value of an exported sample, or let the SDK add the source; confirm by readback.

## `datasource.json`

| Field | Meaning |
|---|---|
| `type` | `lakehouse_tables`, `lakehouse`, `data_warehouse`, `kusto`, `semantic_model`, `graph`, `mirrored_database`, `mirrored_azure_databricks` (documented enum) |
| `userDescription` | source description (routing signal). Not supported for semantic models |
| `dataSourceInstructions` | source instructions sent to the query tool. Not supported for semantic models |
| `elements[]` | tree of `{id (uuid), is_selected, display_name, type, data_type?, description, children[]}` |

### Element trees by source

| Source | Tree (observed or documented) | Notes |
|---|---|---|
| Lakehouse (`lakehouse_tables`) | `schema_grouping` "Schemas" → `lakehouse_tables.schema` (`dbo`) → `table_grouping` "Tables" → `lakehouse_tables.table` → `lakehouse_tables.column` | Verified live. Grouping nodes are `is_selected: false`; tables/columns `true` |
| Warehouse / mirrored DB | `warehouse_tables.schema` / `warehouse_tables.table` / `warehouse_tables.column`; `mirrored_database.schema` / `.table` / `.column` | Documented enum; mirror a service export |
| Semantic model | `semantic_model.table` (top level) → `semantic_model.column` and `semantic_model.measure` children | Observed in an export; `description` mirrors model metadata |
| Eventhouse KQL | `kusto.table` → `kusto.column`; `kusto.functions` | Documented enum; mirror a service export |
| Graph | `graph.nodeType`, `graph.edgeType` | No schema selection |

- **Selection is per element** (`is_selected`). The export shows table-level selection for SQL; **column-level selection is not supported** for SQL sources (semantic-model column control comes from Prep for AI).
- `description` on an element is the **schema object description** (SQL: needs the preview runtime) or model metadata (semantic model). `null` means none.
- Never change `id` values; edit `is_selected` / `description` in place. Do not rebuild a tree from scratch unless creating a source.

## `stage_config.json`

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/dataAgent/definition/stageConfiguration/1.0.0/schema.json",
  "aiInstructions": null,
  "experimental": { "enableExperimentalFeatures": true }
}
```

`enableExperimentalFeatures = true` is the preview-runtime marker (the same signal the Analyzer reports); confirm in the portal. Do not flip it without an explicit decision: preview use is a release gate and enables features documented only for the preview runtime.

## Verified operations (lakehouse source, scratch workspace)

| Operation | Endpoint | Behavior |
|---|---|---|
| Create with definition | `POST /v1/workspaces/{ws}/items` `{"displayName", "type": "DataAgent", "definition": {"parts": [...]}}` | LRO; returns the item. The service accepted a tree generated from `INFORMATION_SCHEMA.COLUMNS`. **The published stage parts are required** (`Files/Config/published/stage_config.json` at minimum; omitting them fails with "The import definition must include 'Files/Config/published/stage_config.json'"), so a definition-created agent starts with a published stage identical to its draft |
| Export | `POST /v1/workspaces/{ws}/items/{id}/getDefinition` | LRO; poll `Location`, then `GET {Location}/result` |
| Update | `POST /v1/workspaces/{ws}/items/{id}/updateDefinition` `{"definition": {"parts": [...]}}` | LRO. **Full replace**: omitted parts are removed (an absent `fewshots.json` removes all examples); `published/` untouched when re-sent as exported |

Other source types use the same item APIs; their element trees and folder names must be confirmed by readback (and the Analyzer) on first use.

## Pitfalls

- A part you forget is a part you delete.
- Descriptions on elements and source-level fields not supported by a source type are ignored or rejected; check the per-source reference first (listed in SKILL.md).
- Draft changes are not visible to consumers until published.
- `GET /v1/workspaces/{ws}/lakehouses/{id}` returns `404 CapacityNotActive` on a paused capacity even though `GET .../items` lists the item.
