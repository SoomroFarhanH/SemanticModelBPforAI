"""Static knowledge used by the rules: connectors, operation classes, pricing, doc links."""
from __future__ import annotations

DOC_BP = "https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-performance-best-practices"
DOC_DECISION = "https://learn.microsoft.com/en-us/fabric/fundamentals/decision-guide-pipeline-dataflow-spark"
DOC_FASTCOPY = "https://learn.microsoft.com/en-us/fabric/data-factory/dataflows-gen2-fast-copy"
DOC_STAGED = "https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-staged-data-options"
DOC_MODERN = "https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-modern-evaluator"
DOC_PARTITION = "https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-partitioned-compute"
DOC_INCREMENTAL = "https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-incremental-refresh"
DOC_DEST = "https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-data-destinations-and-managed-settings"
DOC_PRICING = "https://learn.microsoft.com/en-us/fabric/data-factory/pricing-dataflows-gen2"
DOC_BENCH = "https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-cost-performance-benchmarks"
DOC_FOLDING = "https://learn.microsoft.com/en-us/power-query/query-folding-basics"
DOC_PQ_BP = "https://learn.microsoft.com/en-us/power-query/best-practices"
DOC_CICD = "https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-cicd-and-git-integration"

# Published Dataflow Gen2 rate card (CU per second).
STANDARD_TIER1_RATE = 12.0
STANDARD_TIER1_SECONDS = 600
STANDARD_TIER2_RATE = 1.5
STANDARD_LEGACY_RATE = 16.0
HIGH_SCALE_RATE = 6.0
FAST_COPY_RATE = 1.5

# prefix -> (family, can_fold, fast_copy_connector)
CONNECTORS = {
    "Sql.Database": ("sql", True, True),
    "Sql.Databases": ("sql", True, True),
    "PostgreSQL.Database": ("sql", True, True),
    "Oracle.Database": ("sql", True, True),
    "Snowflake.Database": ("sql", True, True),
    "Snowflake.Databases": ("sql", True, True),
    "Fabric.Warehouse": ("fabric_warehouse", True, True),
    "Lakehouse.Contents": ("fabric_lakehouse", True, True),
    "AzureStorage.DataLake": ("adls", False, True),
    "AzureStorage.DataLakeContents": ("adls", False, True),
    "AzureStorage.Blobs": ("blob", False, True),
    "AzureStorage.BlobContents": ("blob", False, True),
    "MySQL.Database": ("sql", True, False),
    "Odbc.DataSource": ("odbc", True, False),
    "Odbc.Query": ("odbc", False, False),
    "OleDb.DataSource": ("odbc", True, False),
    "Teradata.Database": ("sql", True, False),
    "SapHana.Database": ("sql", True, False),
    "SapBusinessWarehouse.Cubes": ("sql", False, False),
    "Db2.Database": ("sql", True, False),
    "Informix.Database": ("sql", True, False),
    "AmazonRedshift.Database": ("sql", True, False),
    "GoogleBigQuery.Database": ("sql", True, False),
    "Databricks.Catalogs": ("sql", True, False),
    "Databricks.Query": ("sql", False, False),
    "Spark.Tables": ("sql", True, False),
    "Impala.Database": ("sql", True, False),
    "Vertica.Database": ("sql", True, False),
    "AzureDataExplorer.Contents": ("kql", True, False),
    "Folder.Files": ("file", False, False),
    "Folder.Contents": ("file", False, False),
    "File.Contents": ("file", False, False),
    "SharePoint.Files": ("sharepoint", False, False),
    "SharePoint.Contents": ("sharepoint", False, False),
    "SharePoint.Tables": ("sharepoint", False, False),
    "Web.Contents": ("web", False, False),
    "Web.BrowserContents": ("web", False, False),
    "Web.Page": ("web", False, False),
    "OData.Feed": ("odata", True, False),
    "PowerPlatform.Dataflows": ("dataflow_connector", False, False),
    "Dataflows.": ("dataflow_connector", False, False),
    "CommonDataService.Database": ("saas", True, False),
    "Dynamics365.": ("saas", False, False),
    "Salesforce.": ("saas", False, False),
    "EventHubs.": ("stream", False, False),
    "Kafka.": ("stream", False, False),
    "AzureIoTHub.": ("stream", False, False),
    "DocumentDB.Contents": ("nosql", False, False),
    "MongoDBAtlasODBC.": ("nosql", False, False),
    "Excel.Workbook": ("file_parser", False, False),
    "Csv.Document": ("file_parser", False, False),
    "Json.Document": ("file_parser", False, False),
    "Xml.Tables": ("file_parser", False, False),
    "Parquet.Document": ("file_parser", False, False),
}

SOURCE_FAMILIES_THAT_FOLD = {"sql", "fabric_warehouse", "fabric_lakehouse", "kql", "odata", "odbc", "saas"}

# Operations that normally fold to relational sources.
FOLDING_FRIENDLY = {
    "Table.SelectRows", "Table.SelectColumns", "Table.RemoveColumns", "Table.RenameColumns",
    "Table.ReorderColumns", "Table.FirstN", "Table.Sort", "Table.Group", "Table.Join",
    "Table.NestedJoin", "Table.Distinct", "Table.TransformColumnTypes", "Table.Skip",
    "Table.AddColumn", "Table.ExpandTableColumn", "Table.Combine", "Table.Unpivot",
    "Table.UnpivotOtherColumns", "Table.Pivot", "Table.RemoveFirstN", "Table.Range",
    "Table.Schema", "Table.TransformColumns", "Table.ReplaceValue",
}

# Operations that commonly break query folding or force evaluation in the mashup engine.
FOLD_BREAKERS = {
    "Table.Buffer", "List.Buffer", "Binary.Buffer", "Table.AddIndexColumn", "Table.FillDown",
    "Table.FillUp", "Table.Transpose", "Table.DemoteHeaders",
    "Table.SplitColumn", "Table.CombineColumns", "Table.RemoveRowsWithErrors",
    "Table.ReplaceErrorValues", "Table.TransformColumnNames", "Table.FuzzyJoin",
    "Table.FuzzyNestedJoin", "Table.FuzzyGroup", "Table.Profile", "Table.ToRows",
    "Table.FromRows", "Table.FromRecords", "Table.FromList", "Table.FromColumns",
    "Table.ExpandRecordColumn", "Table.ExpandListColumn", "Table.Repeat", "Table.AddRankColumn",
    "Table.AddJoinColumn", "Table.ReverseRows", "Table.Partition", "Table.Split",
    "Table.MatchesAllRows", "Table.SelectRowsWithErrors", "Table.TransformRows",
    "Table.ToList", "Table.ToColumns", "Table.Column",
    "Json.Document", "Json.FromValue", "Xml.Tables", "Text.Proper", "Text.PadStart",
    "Text.PadEnd", "Text.Split", "Text.Combine", "Text.Select", "Text.Remove",
    "List.Accumulate", "List.Generate", "List.Transform", "Function.Invoke", "Value.Metadata",
    "Expression.Evaluate",
}

# Heavy, memory-hungry operations that benefit from staging compute (SQL DW engine).
HEAVY_OPS = {
    "Table.Join", "Table.NestedJoin", "Table.FuzzyJoin", "Table.FuzzyNestedJoin", "Table.Group",
    "Table.Pivot", "Table.Unpivot", "Table.UnpivotOtherColumns", "Table.Sort", "Table.Distinct",
    "Table.Combine", "Table.Buffer", "Table.AddIndexColumn", "Table.FillDown", "Table.FillUp",
    "Table.Transpose", "Table.AddRankColumn", "Table.FuzzyGroup",
}

FILTER_OPS = {"Table.SelectRows", "Table.FirstN", "Table.Range", "Table.Skip", "Table.RemoveFirstN",
              "Table.RemoveLastN", "Table.LastN", "Table.SelectRowsWithErrors"}
COLUMN_PRUNE_OPS = {"Table.SelectColumns", "Table.RemoveColumns"}
JOIN_OPS = {"Table.Join", "Table.NestedJoin", "Table.FuzzyJoin", "Table.FuzzyNestedJoin"}
PREVIEW_LIMIT_OPS = {"Table.FirstN", "Table.Range", "Table.Sample"}

# What Fast Copy supports on file sources.
FAST_COPY_FILE_OPS = {
    "Table.TransformColumnTypes", "Table.SelectColumns", "Table.RemoveColumns", "Table.RenameColumns",
    "Table.PromoteHeaders", "Table.ExpandTableColumn", "Table.AddColumn", "Table.SelectRows",
    "Table.ReorderColumns", "Csv.Document", "Parquet.Document", "Excel.Workbook",
}

def match_connector(fn: str):
    """Return (prefix, (family, can_fold, fast_copy)) for a connector function name, else None."""
    for prefix, info in CONNECTORS.items():
        if fn == prefix or (prefix.endswith(".") and fn.startswith(prefix)) or fn.startswith(prefix + "."):
            return prefix, info
    return None


NETWORK_ROW_FUNCS = {"Web.Contents", "Web.BrowserContents", "OData.Feed", "Sql.Database", "Odbc.Query"}
