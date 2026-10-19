# Distinct source variants

The following files differed byte-for-byte from their organized counterparts.
They are retained under [SemanticModelBPforAI-Root](SemanticModelBPforAI-Root/)
instead of being silently discarded or overwritten.

| Preserved root-level copy | Default organized counterpart |
| --- | --- |
| [DirectQuery notebook](SemanticModelBPforAI-Root/DirectQuery_BestPractices_Check.ipynb) | [SemanticModel-Optimization notebook](../SemanticModel-Optimization/DirectQuery_BestPractices_Check.ipynb) |
| [DirectQuery Tabular Editor script](SemanticModelBPforAI-Root/DirectQuery_BestPractices_Check_TabularEditor2.cs) | [SemanticModel-Optimization script](../SemanticModel-Optimization/DirectQuery_BestPractices_Check_TabularEditor2.cs) |
| [Performance Analyzer notebook](SemanticModelBPforAI-Root/Power%20BI%20Performance%20Analyzer%20Diagnostics.ipynb) | [Performance diagnostics notebook](../PowerBI-Performance-Analyzer-Diagnostics/Power%20BI%20Performance%20Analyzer%20Diagnostics.ipynb) |
| [DirectQuery parallelism script](SemanticModelBPforAI-Root/Set-PBIDirectQueryParallelism.ps1) | [PowerBI-Model-Settings script](../PowerBI-Model-Settings/Set-PBIDirectQueryParallelism.ps1) |

A different hash does not necessarily mean a functional difference: metadata,
formatting, or saved outputs can also differ. No version precedence is inferred.
Use the organized counterpart first and compare a variant deliberately if needed.
The PowerShell scripts modify settings when run.

For public sharing, saved notebook outputs and execution counts were cleared, and
the Performance Analyzer variant's client-specific input path was replaced with
an empty configurable `INPUT_PATH`. The local originals remain unchanged.

See [manifest.json](../manifest.json) for original paths and SHA-256 hashes.
