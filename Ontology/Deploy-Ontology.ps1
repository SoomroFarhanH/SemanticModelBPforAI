<#
.SYNOPSIS
    Imports the BudgetAnalysis_Generic Fabric IQ ontology into your Fabric workspace and binds it to
    your own copy of the BudgetAnalysis semantic model.

.DESCRIPTION
    The ontology definition in .\BudgetAnalysis_Generic points at the author's workspace and semantic
    model. This script retargets it to yours and creates (or updates) the ontology item:

      1. Resolves your workspace, semantic model and (optional) Power BI report by name.
      2. Reads your semantic model definition and checks that every table and column the ontology
         uses exists. Measures that are missing in your model are skipped with a warning.
      3. Rewrites the DirectQuery connection, source lineage tags, report links and item metadata.
      4. Creates the ontology item (or updates it with -Update) and reads it back to verify.

    Use -OutputPath to only write the retargeted definition to a folder (for Fabric Git integration)
    without calling the create API.

.PARAMETER WorkspaceName
    Fabric workspace that contains your semantic model. The ontology is created in the same workspace.

.PARAMETER SemanticModelName
    Name of your BudgetAnalysis semantic model (must contain the tables and columns listed in the README).

.PARAMETER ReportName
    Optional Power BI report to link from every entity type. Defaults to a report with the same name
    as the semantic model, if one exists. Use -NoReportLinks to skip.

.PARAMETER OntologyName
    Display name of the ontology item to create. Default: BudgetAnalysis_Generic.

.PARAMETER Update
    Update an existing ontology item with the same name instead of failing.

.PARAMETER OutputPath
    Write the retargeted definition to <OutputPath>\<OntologyName> and stop (no item is created).

.EXAMPLE
    az login
    .\Deploy-Ontology.ps1 -WorkspaceName "Finance Analytics" -SemanticModelName "BudgetAnalysis"

.EXAMPLE
    .\Deploy-Ontology.ps1 -WorkspaceName "Finance Analytics" -SemanticModelName "BudgetAnalysis" -Update

.EXAMPLE
    .\Deploy-Ontology.ps1 -WorkspaceName "Finance Analytics" -SemanticModelName "BudgetAnalysis" -OutputPath .\retargeted

.NOTES
    Requires: Azure CLI (az login), PowerShell 5.1 or 7+, Contributor on the workspace, and Read + Build
    on the semantic model. Ontology is a Fabric preview feature.
    Developed by Farhan Soomro. MIT License. Provided "AS IS", without warranty of any kind.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)][string]$WorkspaceName,
    [Parameter(Mandatory = $true)][string]$SemanticModelName,
    [string]$ReportName,
    [switch]$NoReportLinks,
    [string]$OntologyName = 'BudgetAnalysis_Generic',
    [string]$DefinitionPath = (Join-Path $PSScriptRoot 'BudgetAnalysis_Generic'),
    [switch]$Update,
    [string]$OutputPath,
    [hashtable]$AdditionalHeaders = @{}
)

$ErrorActionPreference = 'Stop'
$Fabric = 'https://api.fabric.microsoft.com'

# ------------------------------------------------------------------ helpers

function Get-FabricToken {
    $t = az account get-access-token --resource $Fabric --query accessToken -o tsv 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $t) { throw "Could not get a Fabric token. Run 'az login' first." }
    return $t
}

function Get-Headers {
    $h = @{ Authorization = "Bearer $script:Token" }
    foreach ($k in $AdditionalHeaders.Keys) { $h[$k] = $AdditionalHeaders[$k] }
    return $h
}

function Invoke-Fabric([string]$Method, [string]$Path, $Body = $null) {
    $params = @{ Method = $Method; Uri = "$Fabric$Path"; Headers = (Get-Headers); UseBasicParsing = $true }
    if ($null -ne $Body) {
        $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 20 -Compress))
        $params.ContentType = 'application/json; charset=utf-8'
    }
    try { $r = Invoke-WebRequest @params }
    catch {
        $detail = $_.ErrorDetails.Message
        throw "Fabric API $Method $Path failed: $($_.Exception.Message) $detail"
    }
    if ($r.StatusCode -eq 202) {
        $opId = @($r.Headers['x-ms-operation-id'])[0]
        if (-not $opId) { return $null }
        do {
            Start-Sleep -Seconds 3
            $op = Invoke-RestMethod -Uri "$Fabric/v1/operations/$opId" -Headers (Get-Headers)
        } while ($op.status -notin @('Succeeded', 'Failed', 'Cancelled'))
        if ($op.status -ne 'Succeeded') {
            throw "Operation $($op.status): $($op.error | ConvertTo-Json -Compress)"
        }
        try { return Invoke-RestMethod -Uri "$Fabric/v1/operations/$opId/result" -Headers (Get-Headers) }
        catch { return $null }
    }
    if ($r.Content) { return ($r.Content | ConvertFrom-Json) }
    return $null
}

function Get-FabricList([string]$Path) {
    $items = @()
    $uri = "$Fabric$Path"
    while ($uri) {
        $r = Invoke-RestMethod -Uri $uri -Headers (Get-Headers)
        $items += @($r.value)
        $uri = $r.continuationUri
    }
    return $items
}

function Find-One($Items, [string]$Name, [string]$Kind) {
    $m = @($Items | Where-Object { $_.displayName -eq $Name })
    if ($m.Count -eq 0) { throw "$Kind '$Name' not found." }
    if ($m.Count -gt 1) { throw "More than one $Kind named '$Name' found." }
    return $m[0]
}

function ConvertFrom-TmdlName([string]$Text) {
    # Returns the object name at the start of $Text ('Quoted Name' or Bare).
    $Text = $Text.Trim()
    if ($Text.StartsWith("'")) {
        $i = 1
        while ($i -lt $Text.Length) {
            if ($Text[$i] -eq "'") {
                if ($i + 1 -lt $Text.Length -and $Text[$i + 1] -eq "'") { $i += 2; continue }
                break
            }
            $i++
        }
        return $Text.Substring(1, $i - 1).Replace("''", "'")
    }
    return ($Text -split '[\s=]', 2)[0]
}

function Get-TmdlLineageMap([string[]]$TableFiles) {
    # Map "T|table", "C|table|column", "M|table|measure" -> lineageTag for a semantic model.
    $map = @{}
    foreach ($text in $TableFiles) {
        $table = $null; $obj = $null
        foreach ($line in ($text -replace "`r`n", "`n").Split("`n")) {
            if ($line -match '^table (.+)$') { $table = ConvertFrom-TmdlName $Matches[1]; $obj = "T|$table"; continue }
            if ($line -match '^\t(column|measure) (.+)$') {
                $kind = if ($Matches[1] -eq 'column') { 'C' } else { 'M' }
                $obj = "$kind|$table|$(ConvertFrom-TmdlName $Matches[2])"; continue
            }
            if ($line -match '^\t(partition|hierarchy|annotation|calculationGroup|changedProperty) ') { $obj = $null; continue }
            if ($obj -and $obj.StartsWith('T|') -and $line -match '^\tlineageTag: (.+)$') { $map[$obj] = $Matches[1].Trim(); continue }
            if ($obj -and -not $obj.StartsWith('T|') -and $line -match '^\t\tlineageTag: (.+)$') { $map[$obj] = $Matches[1].Trim() }
        }
    }
    return $map
}

function Write-Utf8NoBom([string]$Path, [string]$Text) {
    $dir = Split-Path $Path -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    [IO.File]::WriteAllText($Path, $Text, (New-Object Text.UTF8Encoding($false)))
}

# ------------------------------------------------------------------ 1. resolve target

$script:Token = Get-FabricToken
Write-Host "Resolving workspace '$WorkspaceName' and semantic model '$SemanticModelName'..."
$ws = Find-One (Get-FabricList '/v1/workspaces') $WorkspaceName 'Workspace'
$sm = Find-One (Get-FabricList "/v1/workspaces/$($ws.id)/semanticModels") $SemanticModelName 'Semantic model'

$report = $null
if (-not $NoReportLinks) {
    $reports = @(Get-FabricList "/v1/workspaces/$($ws.id)/reports")
    $rn = if ($ReportName) { $ReportName } else { $SemanticModelName }
    $report = @($reports | Where-Object { $_.displayName -eq $rn })[0]
    if (-not $report -and $ReportName) { throw "Report '$ReportName' not found in workspace '$WorkspaceName'." }
    if (-not $report) { Write-Warning "No report named '$rn' found; entity types will have no report link." }
}

# ------------------------------------------------------------------ 2. read definition

$root = (Resolve-Path $DefinitionPath).Path
$files = [ordered]@{}
Get-ChildItem -Path $root -Recurse -File -Force | Where-Object { $_.Name -notin @('README.md', '.gitattributes') } | ForEach-Object {
    $rel = $_.FullName.Substring($root.Length + 1).Replace('\', '/')
    $files[$rel] = ([IO.File]::ReadAllText($_.FullName)) -replace "`r`n", "`n"
}
if (-not $files.Contains('expressions.tmdl')) { throw "expressions.tmdl not found under $root" }

$m = [regex]::Match($files['expressions.tmdl'], 'DirectQuery to AS - ([0-9a-fA-F-]{36})/([0-9a-fA-F-]{36})')
if (-not $m.Success) { throw 'Could not find the DirectQuery source in expressions.tmdl.' }
$srcWsId = $m.Groups[1].Value; $srcSmId = $m.Groups[2].Value
$srcReportIds = @([regex]::Matches(($files.Keys | Where-Object { $_ -like 'entities/*' } | ForEach-Object { $files[$_] }) -join "`n",
        '\t\t\titemId: ([0-9a-fA-F-]{36})') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)

# ------------------------------------------------------------------ 3. validate against your model

Write-Host "Reading semantic model definition..."
$smDef = Invoke-Fabric 'POST' "/v1/workspaces/$($ws.id)/semanticModels/$($sm.id)/getDefinition?format=TMDL" @{}
$smTables = @($smDef.definition.parts | Where-Object { $_.path -like 'definition/tables/*.tmdl' } |
        ForEach-Object { [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($_.payload)) })
$target = Get-TmdlLineageMap $smTables

$missing = New-Object System.Collections.Generic.List[string]
$skippedMeasures = New-Object System.Collections.Generic.List[string]
foreach ($path in @($files.Keys | Where-Object { $_ -like 'tables/*.tmdl' })) {
    $blocks = $files[$path] -split "`n`n"
    $table = $null
    $out = New-Object System.Collections.Generic.List[string]
    foreach ($block in $blocks) {
        if ($block -match '(?m)^table (.+)$') {
            $table = ConvertFrom-TmdlName $Matches[1]
            if (-not $target.ContainsKey("T|$table")) { $missing.Add("table '$table'") }
            else { $block = $block -replace '(?m)^(\tsourceLineageTag: ).*$', ('${1}' + $target["T|$table"]) }
        }
        elseif ($block -match '(?m)^\tcolumn (.+)$') {
            $col = ConvertFrom-TmdlName $Matches[1]
            $key = "C|$table|$col"
            if (-not $target.ContainsKey($key)) { $missing.Add("column '$table'[$col]") }
            else { $block = $block -replace '(?m)^(\t\tsourceLineageTag: ).*$', ('${1}' + $target[$key]) }
        }
        elseif ($block -match '(?m)^\tmeasure (.+)$') {
            $mea = ConvertFrom-TmdlName $Matches[1]
            $key = "M|$table|$mea"
            if (-not $target.ContainsKey($key)) { $skippedMeasures.Add("'$table'[$mea]"); continue }
            $block = $block -replace '(?m)^(\t\tsourceLineageTag: ).*$', ('${1}' + $target[$key])
        }
        $out.Add($block)
    }
    $files[$path] = $out -join "`n`n"
}
if ($missing.Count -gt 0) {
    $hint = ''
    if ($missing -match 'Financial Entry Key') {
        $hint = "`nAdd the key column to the Financials table (see README):`n  Financial Entry Key = FORMAT('Financials'[Date], ""yyyy-MM"") & ""|"" & 'Financials'[Account Key] & ""|"" & 'Financials'[Department Key] & ""|"" & 'Financials'[Scenario]"
    }
    throw ("Semantic model '$SemanticModelName' is missing objects the ontology needs:`n  " + ($missing -join "`n  ") + $hint)
}
foreach ($s in $skippedMeasures) { Write-Warning "Measure $s not found in your model; it is skipped." }

# ------------------------------------------------------------------ 4. retarget

$escM = { param($v) $v.Replace('"', '""') }
$newExpr = "DirectQuery to AS - $($ws.id)/$($sm.id)"
$pinned = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.0000000+00:00")
foreach ($path in @($files.Keys)) {
    $t = $files[$path]
    $t = $t.Replace("DirectQuery to AS - $srcWsId/$srcSmId", $newExpr)
    if ($path -eq 'expressions.tmdl') {
        $db = 'AnalysisServices.Database("powerbi://api.powerbi.com/v1.0/myorg/' + (& $escM $ws.displayName) + '", "' + (& $escM $sm.displayName) + '")'
        $t = [regex]::Replace($t, 'AnalysisServices\.Database\("[^"]*(?:""[^"]*)*",\s*"[^"]*(?:""[^"]*)*"\)', { param($x) $db })
    }
    if ($path -like 'tables/*') {
        $t = $t -replace '(?m)^(\t\tannotation ONT_WorkspaceId = ).*$', ('${1}' + $ws.id)
        $t = $t -replace '(?m)^(\t\tannotation ONT_ItemId = ).*$', ('${1}' + $sm.id)
        $t = [regex]::Replace($t, '(?m)^(\t\tannotation ONT_WorkspaceName = ).*$', { param($x) $x.Groups[1].Value + $ws.displayName })
        $t = [regex]::Replace($t, '(?m)^(\t\tannotation ONT_ItemName = ).*$', { param($x) $x.Groups[1].Value + $sm.displayName })
        $t = $t -replace '(?m)^(\t\tannotation ONT_PinnedAtUtc = ).*$', ('${1}' + $pinned)
    }
    if ($path -like 'entities/*') {
        if ($report) {
            $t = $t -replace '(?m)^(\t\t\tworkspaceId: ).*$', ('${1}' + $ws.id)
            foreach ($rid in $srcReportIds) { $t = $t.Replace("itemId: $rid", "itemId: $($report.id)") }
        }
        else {
            $t = [regex]::Replace($t, "\t///[^\n]*\n\tresourceLink\n\n\t\titem\n\t\t\tworkspaceId: [^\n]*\n\t\t\titemId: [^\n]*\n\n(?:\t\tsynonym [^\n]*\n)*\n?", '')
        }
    }
    $files[$path] = $t
}
$platform = $files['.platform'] | ConvertFrom-Json
$platform.metadata.displayName = $OntologyName
$files['.platform'] = $platform | ConvertTo-Json -Depth 10

# ------------------------------------------------------------------ 5a. write only (Git integration)

if ($OutputPath) {
    $dest = Join-Path $OutputPath $OntologyName
    foreach ($path in $files.Keys) { Write-Utf8NoBom (Join-Path $dest ($path.Replace('/', [IO.Path]::DirectorySeparatorChar))) $files[$path] }
    Write-Host "Retargeted definition written to $dest ($($files.Count) files)." -ForegroundColor Green
    return
}

# ------------------------------------------------------------------ 5b. create or update

$parts = @($files.Keys | ForEach-Object {
        @{ path = $_; payload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($files[$_])); payloadType = 'InlineBase64' }
    })
$existing = @(Get-FabricList "/v1/workspaces/$($ws.id)/items?type=Ontology" | Where-Object { $_.displayName -eq $OntologyName })[0]
if ($existing -and -not $Update) { throw "An ontology named '$OntologyName' already exists. Use -Update to overwrite it or -OntologyName to pick another name." }

$action = if ($existing) { 'Update ontology definition' } else { 'Create ontology' }
if (-not $PSCmdlet.ShouldProcess("$OntologyName in workspace '$($ws.displayName)'", $action)) { return }

if ($existing) {
    Invoke-Fabric 'POST' "/v1/workspaces/$($ws.id)/items/$($existing.id)/updateDefinition" @{ definition = @{ parts = @($parts | Where-Object { $_.path -ne '.platform' }) } } | Out-Null
    $itemId = $existing.id
}
else {
    Invoke-Fabric 'POST' "/v1/workspaces/$($ws.id)/items" @{
        displayName = $OntologyName; type = 'Ontology'; description = $platform.metadata.description; definition = @{ parts = $parts }
    } | Out-Null
    $itemId = (@(Get-FabricList "/v1/workspaces/$($ws.id)/items?type=Ontology" | Where-Object { $_.displayName -eq $OntologyName })[0]).id
}

$back = Invoke-Fabric 'POST' "/v1/workspaces/$($ws.id)/items/$itemId/getDefinition" @{}
$entities = @($back.definition.parts | Where-Object { $_.path -like 'entities/*' }).Count
$rules = @($back.definition.parts | Where-Object { $_.path -like 'rules/*' }).Count
Write-Host ""
Write-Host "$action succeeded: $OntologyName ($itemId)" -ForegroundColor Green
Write-Host "  Parts: $(@($back.definition.parts).Count)   Entity types: $entities   Rules: $rules   Skipped measures: $($skippedMeasures.Count)"
Write-Host "  Open:  https://app.fabric.microsoft.com/groups/$($ws.id)/ontologies/$itemId"
Write-Host "  MCP:   $Fabric/v1/mcp/dataPlane/workspaces/$($ws.id)/items/$itemId/ontologyEndpoint"
