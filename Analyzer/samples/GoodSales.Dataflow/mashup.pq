[StagingDefinition = [Kind = "FastCopy"]]
section Section1;
shared DesignDateFilter = #datetime(2020, 1, 1, 0, 0, 0) meta [IsParameterQuery = true, Type = "DateTime", IsParameterQueryRequired = true];
shared StagedOrders = let
  Source = Sql.Database("contoso.database.windows.net", "Sales"),
  Orders = Source{[Schema = "dbo", Item = "Orders"]}[Data],
  Selected = Table.SelectColumns(Orders, {"OrderId", "CustomerId", "OrderDate", "Qty", "Price"}),
  Filtered = Table.SelectRows(Selected, each [OrderDate] >= DesignDateFilter),
  Typed = Table.TransformColumnTypes(Filtered, {{"OrderId", Int64.Type}, {"Qty", Int64.Type}, {"Price", type number}})
in
  Typed;
[DataDestinations = {[Definition = [Kind = "Reference", QueryName = "SalesByCustomer_DataDestination", IsNewTarget = true], Settings = [Kind = "Manual", AllowCreation = true, ColumnSettings = [Mappings = {[SourceColumnName = "CustomerId", DestinationColumnName = "CustomerId"]}], DynamicSchema = false, UpdateMethod = [Kind = "Replace"], TypeSettings = [Kind = "Table"]]]}]
shared SalesByCustomer = let
  Source = StagedOrders,
  Grouped = Table.Group(Source, {"CustomerId"}, {{"Total", each List.Sum([Price]), type number}})
in
  Grouped;
shared SalesByCustomer_DataDestination = let
  Pattern = Lakehouse.Contents(null),
  Navigation_1 = Pattern{[workspaceId = "00000000-0000-0000-0000-000000000000"]}[Data],
  TableNavigation = Navigation_1{[Id = "SalesByCustomer", ItemKind = "Table"]}?[Data]?
in
  TableNavigation;
