# Semantic model optimization diagnostics

| Notebook or script | Purpose |
| --- | --- |
| [DirectQuery_BestPractices_Check.ipynb](DirectQuery_BestPractices_Check.ipynb) | Checks DirectQuery semantic-model design and configuration |
| [DirectQuery_BestPractices_Check_TabularEditor2.cs](DirectQuery_BestPractices_Check_TabularEditor2.cs) | Companion checks for Tabular Editor 2 Advanced Scripting |
| [Semantic Model Report AnalyzerMK.ipynb](Semantic%20Model%20Report%20AnalyzerMK.ipynb) | Semantic-model and report metadata analysis |
| [SimplifySchemaForAI.ipynb](SimplifySchemaForAI.ipynb) | Schema analysis for AI-oriented model review |
| [fact_sale_row_group_guidance.ipynb](fact_sale_row_group_guidance.ipynb) | Scenario-specific row-group analysis and remediation guidance |
| [UDFReview.ipynb](UDFReview.ipynb) | DirectQuery monitoring analysis for user-defined aggregation candidates |

Review each notebook's parameters, prerequisites, and target identifiers first.
The row-group notebook contains a specific `fact_sale` scenario; do not apply its
recommendations to a different model without checking the evidence.

The differently named model/report analyzer and schema-review notebooks have
identical source bytes in this snapshot; both original entry-point names are kept.

[Companion tuning scripts](../PowerBI-Model-Settings/README.md) change model
settings and should be reviewed separately. Distinct root-level DirectQuery
notebook/script copies are preserved in [Variants](../Variants/README.md).

DAX-to-Excel export notebooks were not included because they are export workflows,
not diagnostic tools.
