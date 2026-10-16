[StagingDefinition = [Kind = "FastCopy"]]
section Section1;
[DataDestinations = {[Definition = [Kind = "Reference", QueryName = "FactSales_DataDestination", IsNewTarget = true], Settings = [Kind = "Manual", AllowCreation = true, ColumnSettings = [Mappings = {[SourceColumnName = "OrderId", DestinationColumnName = "OrderId"]}], DynamicSchema = true, UpdateMethod = [Kind = "Replace"], TypeSettings = [Kind = "Table"]]]}]
shared FactSales = let
  Source = Sql.Database("onprem-sql01.contoso.local", "Sales"),
  Orders = Source{[Schema = "dbo", Item = "Orders"]}[Data],
  #"Changed type" = Table.TransformColumnTypes(Orders, {{"OrderId", Int64.Type}}),
  #"Changed type 2" = Table.TransformColumnTypes(#"Changed type", {{"Qty", Int64.Type}}),
  #"Changed type 3" = Table.TransformColumnTypes(#"Changed type 2", {{"Price", type number}}),
  Buffered = Table.Buffer(#"Changed type 3"),
  Indexed = Table.AddIndexColumn(Buffered, "Idx", 0, 1),
  Grouped = Table.Group(Indexed, {"CustomerId"}, {{"Total", each List.Sum([Price]), type number}}),
  Sorted = Table.Sort(Grouped, {{"Total", Order.Descending}}),
  Filtered = Table.SelectRows(Sorted, each [OrderDate] >= #date(2020, 1, 1)),
  Enriched = Table.AddColumn(Filtered, "Geo", each Web.Contents("https://api.contoso.com/geo?city=" & [City]))
in
  Enriched;
shared FactSales_DataDestination = let
  Pattern = Lakehouse.Contents(null),
  Navigation_1 = Pattern{[workspaceId = "00000000-0000-0000-0000-000000000000"]}[Data],
  Navigation_2 = Navigation_1{[lakehouseId = "11111111-1111-1111-1111-111111111111"]}[Data],
  TableNavigation = Navigation_2{[Id = "FactSales", ItemKind = "Table"]}?[Data]?
in
  TableNavigation;
shared DimCustomer = let
  Source = PowerPlatform.Dataflows(null),
  Workspaces = Source{[Id = "Workspaces"]}[Data],
  Customers = Workspaces{[workspaceId = "22222222-2222-2222-2222-222222222222"]}[Data]
in
  Customers;
shared RawFiles = let
  Source = AzureStorage.DataLake("https://contosolake.dfs.core.windows.net/landing", [HierarchicalNavigation = true]),
  Filtered = Table.SelectRows(Source, each [Extension] = ".csv"),
  Added = Table.AddColumn(Filtered, "Data", each Csv.Document([Content])),
  Expanded = Table.ExpandTableColumn(Added, "Data", {"A", "B"}),
  Combined = Table.Combine({Expanded})
in
  Combined;
[DataDestinations = {[Definition = [Kind = "Reference", QueryName = "RawFiles_DataDestination", IsNewTarget = true], Settings = [Kind = "Manual", AllowCreation = true, DynamicSchema = false, UpdateMethod = [Kind = "Append"], TypeSettings = [Kind = "Table"]]]}]
shared FilesToWarehouse = let
  Source = AzureStorage.Blobs("contosolake"),
  Navigated = Source{[Name = "landing"]}[Data],
  Grouped = Table.Group(Navigated, {"Name"}, {{"N", each Table.RowCount(_), Int64.Type}}),
  Top = Table.FirstN(Grouped, 1000)
in
  Top;
shared RawFiles_DataDestination = let
  Source = Fabric.Warehouse(null),
  Nav = Source{[workspaceId = "00000000-0000-0000-0000-000000000000"]}[Data]
in
  Nav;
shared Orphan = let
  Source = Excel.Workbook(File.Contents("c:\tmp\x.xlsx")),
  Sorted = Table.Sort(Source, {{"A", Order.Ascending}})
in
  Sorted;
shared Telemetry = let
  Source = EventHubs.Contents("contoso.servicebus.windows.net", "hub")
in
  Source;
