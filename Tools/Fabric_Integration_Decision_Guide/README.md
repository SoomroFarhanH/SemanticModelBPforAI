# Fabric Integration Decision Guide

This interactive guide helps you compare Microsoft Fabric integration options for Snowflake and Databricks based on your source platform and preferred data-movement pattern. It provides a shortlist to explore; it does not connect to your data or configure Fabric.

## Open the guide

1. On GitHub, open [index.html](index.html).
2. Select **Download raw file** in the file toolbar and save the file as `index.html`. Alternatively, right-click **Raw** and select **Save link as**.
3. Open the downloaded file in a modern browser with JavaScript enabled.

GitHub displays the HTML source rather than running the interactive page. The guide runs locally without a server, installation, or Fabric sign-in. An internet connection is needed to open the Microsoft Learn links.

## Use the guide

1. Under **Source platform**, choose one of the four environments:
   - Snowflake on Azure
   - Snowflake on AWS
   - Azure Databricks with Unity Catalog
   - Databricks on AWS / Amazon S3
2. Under **Data movement**, select a pattern. Leave **All movement patterns** selected to see every option listed for that source.
3. Compare the matching approaches. Each card explains **What happens**, **Best for**, and considerations under **Keep in mind**. Select **Microsoft Learn** for the relevant documentation.
4. If there are no matches, choose another movement pattern or select **Show all movement patterns**. A missing match only means the supplied guide does not list that combination; other configurations might still be supported.
5. Select **Reset selections** to start over.

Recommendations are matching options, not a ranked list. Compare the intended use case, prerequisites, permissions, regions, and costs before deciding.

## Data-movement choices

| Choice | What it means in this guide |
| --- | --- |
| All movement patterns | Show all listed approaches for the selected source. |
| No data copy | Access existing table data without replicating the full dataset into Fabric. |
| Replicated | Replicate source data into OneLake for Fabric workloads. |
| Single shared copy | Store the data in OneLake for both platforms to use. |
| Query only (DirectQuery) | Query the source directly instead of importing a full model copy. |
| Query / optional copy | Choose DirectQuery or import data into a Power BI semantic model. |
| Copied / ETL | Copy data into Fabric and optionally orchestrate transformation steps. |

**No data copy** does not mean no network transfer or storage charges: metadata can be created, external shortcut reads can incur transfer costs, and optional caching can store data in Fabric.

## Example selections

- **Snowflake on Azure** + **Single shared copy**: explore **Snowflake Iceberg in OneLake**.
- **Azure Databricks with Unity Catalog** + **No data copy**: compare **Catalog Mirroring**, **Delta Shortcut from ADLS**, and **Iceberg Shortcut from ADLS**.
- **Snowflake on AWS** + **Query only (DirectQuery)**: explore **DirectQuery / Import** and choose DirectQuery rather than Import when setting up the connection.

## Privacy and limitations

Selections are processed in the browser and are not uploaded. The guide is a starting point, not a support guarantee: product capabilities and prerequisites can change. Check the linked Microsoft Learn documentation for the current details before implementing an approach.
