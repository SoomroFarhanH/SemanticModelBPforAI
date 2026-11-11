# Fabric Integration Decision Guide

This interactive guide helps you compare Microsoft Fabric integration options for Snowflake and Databricks based on your source platform and preferred data-movement pattern. It provides a shortlist to explore; it does not connect to your data or configure Fabric.

The guide is based on Gurkamal (GK) Rakhra's blog post, [Modernize data integration strategy with Microsoft Fabric when using Snowflake and Databricks](https://community.fabric.microsoft.com/blog/fbc_fabricupdatesblogs/modernize-data-integration-strategy-with-microsoft-fabric-when-using-snowflake-a/5377581).

## Open the guide

[**Open the interactive guide**](https://soomrofarhanh.github.io/SemanticModelBPforAI/)

The guide is hosted on GitHub Pages and opens directly in a modern browser with JavaScript enabled. No download, installation, GitHub account, or Fabric sign-in is required.

For offline use, open [index.html](index.html) on GitHub, select **Download raw file**, and open the saved file in your browser. An internet connection is still needed for the Microsoft Learn links.

## Publishing updates

The [deployment workflow](../../.github/workflows/deploy-integration-guide.yml) publishes this folder to the site's root when changes to this folder or the workflow are pushed to `main`. It can also be run manually from the repository's **Actions** tab. Only this guide's folder is published, not the rest of the repository.

In the repository's **Settings > Pages**, keep **Source** set to **GitHub Actions**. The workflow's deployment summary includes the live site URL.

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
