<!-- Source reference for the `dataagent-cli` skill: graph model, ontology, Azure AI Search (all preview). Loaded on demand from `planning.md` and `authoring.md`. -->

# Graph model, Ontology, Azure AI Search (preview)

These sources are **preview**. Record explicit owner acceptance of preview status in the spec, expect behavior to change, and state that they were not exercised by this skill's own testing. Source: [data source configuration](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-add-datasources).

## Graph model (GQL)

Query tool: **NL2GQL**; the Fabric graph item executes it and incurs graph operation consumption.

| Configuration | Supported |
|---|---|
| Schema selection | **No** (no node/edge scoping) |
| Agent instructions, source instructions, source description, example queries (GQL) | Yes |
| Topics | No |

Best practices: business-readable node labels and meaningful edge verbs (`purchases`, `reportsTo`), a valid unique non-null key on every node type, correct edge endpoints and direction, only needed properties, measure and disclose orphan/dangling keys, reload after structural change, test one-hop/multi-hop/aggregation traversals, narrow `RETURN` (never `RETURN *`) and `LIMIT` expansive patterns. Analyzer: `GRAPH-001` … `GRAPH-012`.

## Ontology

An ontology is a **context source**: it supplies entity definitions, properties, relationships, synonyms, mappings and bindings; the agent resolves the relevant underlying source and generates a source-native SQL, KQL or DAX query that runs under the caller's permissions. No schema selection, no topics. Source instructions, description and example queries apply only to the **mounted underlying source** and are not written back to the ontology. Details: [Use Ontology as context](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-ontology-sources). Best practices: business-friendly entity names, defined entities and keys, resolvable property bindings, meaningful relationship names with keys that match, coverage without orphans, definitions that do not conflict with other sources, and awareness of documented known issues (for example semantic-model bindings and aggregation workarounds). Analyzer: `ONT-001` … `ONT-015`. Use `fabriciq-ontology-cli` for ontology authoring.

## Azure AI Search index (unstructured data)

The index is built outside the agent (PDFs, text, enriched content); the agent queries it with the user's identity and returns citations when the index has URL/file-path fields.

| Setting | Guidance |
|---|---|
| Display name | Clear, business-readable |
| Search type | Full-text, hybrid, or semantic per the index configuration |
| Number of documents | 3–20 recommended |
| Context / description | Index contents, key fields and usage guidance (a routing signal) |
| Agent instructions | How to interpret results and compose the answer |
| Topics | Not supported |

Prerequisites: reachable `https://<service>.search.windows.net` endpoint and index name, **role-based access** enabled on the search service, and the connecting identity assigned **Search Index Data Reader** and **Search Index Data Contributor**. Citations need one exact, case-sensitive field named `url`, `sourceUrl`, `filePath`, `path` or `folderPath` with populated values. Also: non-empty searchable content, traceable chunks, controlled duplicates, measured index freshness, and agent instructions that route policy/prose questions to search and structured aggregations to SQL/KQL/DAX/GQL. Analyzer: `AIS-001` … `AIS-017`. Files in a lakehouse are not read directly; unstructured files need an index.

## What this skill does with them

Plan and document the configuration, write the draft fields the format allows, and always confirm by readback and with the Analyzer. If a field is not supported for the source, say so instead of writing it.
