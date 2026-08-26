<#
.SYNOPSIS
    Checks (and optionally sets) DirectQuery query parallelism for a Power BI /
    Fabric semantic model, with Fabric capacity (F SKU) ceiling awareness.

.DESCRIPTION
    IMPORTANT - what this script does and does NOT do.

    This script sets Model.MaxParallelismPerQuery, which controls "Max DirectQuery
    parallelism": the number of queries that can be processed at the same time.
    Documented behaviour: each SKU publishes a low number (the DEFAULT max concurrent
    queries) and a high number (the CEILING). MaxParallelismPerQuery changes the
    default, up to the ceiling.

    This is NOT the same setting as "Max concurrent DirectQuery connections per
    semantic model", which is enforced by the capacity SKU and cannot be raised
    from the model.

    It is also NOT the Power BI Desktop / service model option "Maximum connections
    per data source". That option throttles connections to a single data source and
    can only cap BELOW the capacity ceiling, never above it.

    Practical consequence on an F SKU: in most cases you do not need to set anything.
    The capacity already enforces the ceiling. Only tune this when DirectQuery query
    response time is the measured bottleneck AND the source can absorb more concurrency.

    Steps performed:
    1. Authenticates to the Power BI service (interactive user or service principal).
    2. Resolves the workspace and semantic model by name.
    3. Resolves the capacity behind the workspace and reports its SKU, then looks up
       the documented DirectQuery limits for that SKU.
    4. Reports bound data sources (informational; non-fatal if unavailable).
    5. Reads the current MaxParallelismPerQuery value and the database compatibility
       level over the workspace XMLA endpoint (TOM).
    6. If -MaxParallelism is supplied with -Apply, validates against the SKU ceiling
       and writes the value.

    NOTE: MaxParallelismPerQuery is only supported when the database compatibility
    level is 1569 or above. Models below that level (e.g. 1550) fail the write until
    upgraded - see -UpgradeCompatibilityLevel. Upgrading is IRREVERSIBLE.

.REQUIREMENTS
    - PowerShell 5.1 or 7.x
    - Module: MicrosoftPowerBIMgmt   (Install-Module MicrosoftPowerBIMgmt)
    - Module: SqlServer              (Install-Module SqlServer)  -> supplies the TOM assemblies
    - Workspace on Fabric F SKU (or Premium P SKU) with the XMLA endpoint set to Read Write
    - Contributor/Member/Admin rights on the workspace

.PARAMETER WorkspaceName
    Name of the Power BI workspace holding the semantic model.

.PARAMETER DatasetName
    Name of the semantic model (dataset).

.PARAMETER MaxParallelism
    Desired max DirectQuery parallelism (concurrent queries). Validated against the
    documented ceiling for the workspace's capacity SKU before writing.
    Omit for a read-only report.

.PARAMETER Apply
    Actually write the value. Without this switch the script only reports.

.PARAMETER UpgradeCompatibilityLevel
    Opt in to raising the database compatibility level to -TargetCompatibilityLevel
    when it is below 1569. THIS IS IRREVERSIBLE.

.PARAMETER TargetCompatibilityLevel
    Level to upgrade to when -UpgradeCompatibilityLevel is used. Default 1600.

.PARAMETER Force
    Skip interactive confirmations (compatibility upgrade, over-ceiling values).

.PARAMETER TenantId / ApplicationId / ClientSecret
    Optional. Supply all three to authenticate as a service principal.

.EXAMPLE
    # Report only - shows SKU ceilings, current value, compat level. Makes no changes.
    .\Set-PBIDirectQueryParallelism.ps1 -WorkspaceName "Demo" -DatasetName "DQ2ContsoDB"

.EXAMPLE
    # Raise parallelism on an F64 model already at compatibility level 1569+
    .\Set-PBIDirectQueryParallelism.ps1 -WorkspaceName "Demo" -DatasetName "DQ2ContsoDB" `
        -MaxParallelism 8 -Apply

.EXAMPLE
    # Same, but the model is below 1569 so upgrade the compatibility level first (irreversible)
    .\Set-PBIDirectQueryParallelism.ps1 -WorkspaceName "Demo" -DatasetName "DQ2ContsoDB" `
        -MaxParallelism 8 -Apply -UpgradeCompatibilityLevel
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]  [string] $WorkspaceName,
    [Parameter(Mandatory = $true)]  [string] $DatasetName,

    # Renamed from -MaxConnections: the property is parallelism, not a connection cap.
    # Old name kept as an alias so existing calls do not silently break.
    [Parameter(Mandatory = $false)]
    [Alias('MaxConnections')]
    [ValidateRange(1, 24)] [int] $MaxParallelism,

    [Parameter(Mandatory = $false)] [switch] $Apply,

    # MaxParallelismPerQuery requires database compatibility level 1569 or above.
    # Raising the level is IRREVERSIBLE, so it must be opted into explicitly.
    [Parameter(Mandatory = $false)] [switch] $UpgradeCompatibilityLevel,
    [Parameter(Mandatory = $false)] [ValidateRange(1569, 1700)] [int] $TargetCompatibilityLevel = 1600,
    [Parameter(Mandatory = $false)] [switch] $Force,

    [Parameter(Mandatory = $false)] [string] $TenantId,
    [Parameter(Mandatory = $false)] [string] $ApplicationId,
    [Parameter(Mandatory = $false)] [string] $ClientSecret,
    [Parameter(Mandatory = $false)] [string] $XmlaBaseUrl = 'powerbi://api.powerbi.com/v1.0/myorg'
)

$ErrorActionPreference = 'Stop'

#region ---------- Documented SKU limits ----------
# Source: "Semantic model SKU limitation" (Power BI Premium / Fabric capacity docs).
#   MaxDQConnections     = Max concurrent DirectQuery connections PER SEMANTIC MODEL.
#                          Enforced by the capacity. NOT settable from the model.
#   ParallelismDefault   = documented default max concurrent queries for the SKU.
#   ParallelismCeiling   = documented maximum. MaxParallelismPerQuery moves the
#                          default toward this ceiling.
# Where default == ceiling == 1, this script has nothing useful to offer.
$SkuLimits = [ordered]@{
    'F2'    = @{ MaxDQConnections = 5;   ParallelismDefault = 1;  ParallelismCeiling = 1  }
    'F4'    = @{ MaxDQConnections = 5;   ParallelismDefault = 1;  ParallelismCeiling = 1  }
    'F8'    = @{ MaxDQConnections = 10;  ParallelismDefault = 1;  ParallelismCeiling = 1  }
    'F16'   = @{ MaxDQConnections = 10;  ParallelismDefault = 1;  ParallelismCeiling = 1  }
    'F32'   = @{ MaxDQConnections = 10;  ParallelismDefault = 1;  ParallelismCeiling = 1  }
    'F64'   = @{ MaxDQConnections = 50;  ParallelismDefault = 4;  ParallelismCeiling = 8  }
    'F128'  = @{ MaxDQConnections = 75;  ParallelismDefault = 6;  ParallelismCeiling = 12 }
    'F256'  = @{ MaxDQConnections = 100; ParallelismDefault = 8;  ParallelismCeiling = 16 }
    'F512'  = @{ MaxDQConnections = 200; ParallelismDefault = 10; ParallelismCeiling = 20 }
    'F1024' = @{ MaxDQConnections = 200; ParallelismDefault = 12; ParallelismCeiling = 24 }
    'F2048' = @{ MaxDQConnections = 200; ParallelismDefault = 12; ParallelismCeiling = 24 }
    'F4096' = @{ MaxDQConnections = 200; ParallelismDefault = 12; ParallelismCeiling = 24 }
    'F8192' = @{ MaxDQConnections = 200; ParallelismDefault = 12; ParallelismCeiling = 24 }
}

# P SKU equivalents, for workspaces not yet migrated to F SKUs.
$PSkuEquivalent = @{ 'P1' = 'F64'; 'P2' = 'F128'; 'P3' = 'F256'; 'P4' = 'F512'; 'P5' = 'F1024' }
#endregion

#region ---------- 0. Modules ----------
foreach ($m in @('MicrosoftPowerBIMgmt', 'SqlServer')) {
    if (-not (Get-Module -ListAvailable -Name $m)) {
        throw "Required module '$m' is not installed. Run: Install-Module $m -Scope CurrentUser"
    }
    Import-Module $m -ErrorAction Stop | Out-Null
}
#endregion

#region ---------- Helper: unwrap REST errors ----------
# Invoke-PowerBIRestMethod wraps HTTP failures in an AggregateException, which hides the
# real status code and response body. This helper unwraps it and prints the actual cause.
function Invoke-PBIRest {
    param(
        [Parameter(Mandatory)] [string] $Url,
        [string] $Method = 'Get',
        [switch] $NonFatal
    )
    try {
        return Invoke-PowerBIRestMethod -Method $Method -Url $Url -ErrorAction Stop
    }
    catch {
        $ex = $_.Exception
        $msgs = @()
        while ($ex) {
            if ($ex -is [System.AggregateException]) {
                foreach ($inner in $ex.Flatten().InnerExceptions) { $msgs += $inner.Message }
            }
            else { $msgs += $ex.Message }

            if ($ex.Response) {
                try {
                    $msgs += "HTTP status: $([int]$ex.Response.StatusCode)"
                    $reader = New-Object System.IO.StreamReader($ex.Response.GetResponseStream())
                    $body = $reader.ReadToEnd()
                    if ($body) { $msgs += "Response body: $body" }
                } catch { }
            }
            $ex = $ex.InnerException
        }

        Write-Warning "    REST call failed: $Url"
        $msgs | Select-Object -Unique | ForEach-Object { Write-Warning "      $_" }

        if ($NonFatal) { return $null }
        throw
    }
}
#endregion

#region ---------- 1. Authenticate to the service FIRST ----------
Write-Host "`n[1] Authenticating to the Power BI service..." -ForegroundColor Cyan

if ($ApplicationId -and $ClientSecret -and $TenantId) {
    $secure = ConvertTo-SecureString $ClientSecret -AsPlainText -Force
    $cred   = New-Object System.Management.Automation.PSCredential($ApplicationId, $secure)
    Connect-PowerBIServiceAccount -ServicePrincipal -Credential $cred -TenantId $TenantId | Out-Null
    Write-Host "    Connected as service principal $ApplicationId" -ForegroundColor Green
}
else {
    Connect-PowerBIServiceAccount | Out-Null
    Write-Host "    Connected as interactive user" -ForegroundColor Green
}

$accessToken = (Get-PowerBIAccessToken -AsString) -replace '^Bearer\s+', ''
#endregion

#region ---------- 2. Resolve workspace + semantic model ----------
Write-Host "[2] Resolving workspace and semantic model..." -ForegroundColor Cyan

# Individual scope FIRST: guarantees the workspace is one you are actually a member of.
$workspace = Get-PowerBIWorkspace -Name $WorkspaceName -ErrorAction SilentlyContinue |
             Where-Object { $_.Name -eq $WorkspaceName } | Select-Object -First 1
if (-not $workspace) {
    Write-Warning "    Not found under your own memberships; retrying with Organization scope."
    Write-Warning "    Note: admin-scope visibility does NOT grant rights to the dataset REST APIs."
    $workspace = Get-PowerBIWorkspace -Name $WorkspaceName -Scope Organization -ErrorAction SilentlyContinue |
                 Where-Object { $_.Name -eq $WorkspaceName } | Select-Object -First 1
}
if (-not $workspace) { throw "Workspace '$WorkspaceName' not found (or you lack access)." }

$dataset = Get-PowerBIDataset -WorkspaceId $workspace.Id |
           Where-Object { $_.Name -eq $DatasetName } | Select-Object -First 1
if (-not $dataset) { throw "Semantic model '$DatasetName' not found in workspace '$WorkspaceName'." }

Write-Host ("    Workspace : {0}  ({1})" -f $workspace.Name, $workspace.Id)
Write-Host ("    Dataset   : {0}  ({1})" -f $dataset.Name,   $dataset.Id)
#endregion

#region ---------- 3. Resolve capacity SKU and look up documented limits ----------
Write-Host "[3] Resolving capacity SKU and DirectQuery limits..." -ForegroundColor Cyan

$skuName   = $null
$skuLimit  = $null

if (-not $workspace.CapacityId) {
    Write-Warning "    Workspace is not assigned to a dedicated capacity (Pro / shared)."
    Write-Warning "    Pro caps DirectQuery at 10 active connections per data source, and"
    Write-Warning "    XMLA write operations are not supported in Pro workspaces."
}
else {
    $rawCap = Invoke-PBIRest -Url "capacities" -NonFatal
    if ($rawCap) {
        $cap = ($rawCap | ConvertFrom-Json).value |
               Where-Object { $_.id -eq $workspace.CapacityId } | Select-Object -First 1
        if ($cap) {
            Write-Host ("    Capacity   : {0}  ({1})" -f $cap.displayName, $cap.id)
            Write-Host ("    State      : {0}" -f $cap.state)

            # sku is typically reported as e.g. "F64" or "P1"; normalize it.
            $skuRaw = "$($cap.sku)".Trim().ToUpper()
            if ($PSkuEquivalent.ContainsKey($skuRaw)) {
                Write-Host ("    SKU        : {0}  (limits equivalent to {1})" -f $skuRaw, $PSkuEquivalent[$skuRaw])
                $skuName = $PSkuEquivalent[$skuRaw]
            }
            elseif ($SkuLimits.Contains($skuRaw)) {
                Write-Host ("    SKU        : {0}" -f $skuRaw)
                $skuName = $skuRaw
            }
            else {
                Write-Warning "    SKU '$skuRaw' not recognized; skipping ceiling validation."
            }
        }
        else {
            Write-Warning "    Capacity $($workspace.CapacityId) not visible to you; skipping ceiling validation."
        }
    }
}

if ($skuName) {
    $skuLimit = $SkuLimits[$skuName]
    Write-Host ""
    Write-Host "    Documented limits for $skuName :" -ForegroundColor Yellow
    Write-Host ("      Max concurrent DQ connections (per model) : {0}   <- capacity-enforced, NOT settable here" -f $skuLimit.MaxDQConnections)
    Write-Host ("      Max DirectQuery parallelism               : {0} - {1}   <- default - ceiling, settable here" -f $skuLimit.ParallelismDefault, $skuLimit.ParallelismCeiling)
    Write-Host ""

    if ($skuLimit.ParallelismCeiling -le 1) {
        Write-Warning "    On $skuName, DirectQuery parallelism is fixed at 1."
        Write-Warning "    Setting MaxParallelismPerQuery gains you nothing on this SKU."
        Write-Warning "    Scale to F64 or higher if query parallelism is your bottleneck."
    }
}
#endregion

#region ---------- 4. Inspect the bound data sources (informational) ----------
Write-Host "[4] Checking data source connections bound to the model..." -ForegroundColor Cyan

$raw = Invoke-PBIRest -Url "groups/$($workspace.Id)/datasets/$($dataset.Id)/datasources" -NonFatal

if ($null -eq $raw) {
    Write-Warning "    Skipping data source inventory. Common causes:"
    Write-Warning "      404 / DMTS_MonikerDatasourcesNotFoundErrorCode - the model has no"
    Write-Warning "            gateway-bound data sources registered against this endpoint."
    Write-Warning "            Expected for models using inline M data source declarations."
    Write-Warning "      403 - you are not the semantic model owner (Settings > Take over)."
    Write-Warning "      401 - token lacks the required scope; reconnect."
    Write-Warning "    This step is informational only. Continuing."
}
else {
    $sources = $raw | ConvertFrom-Json
    if (-not $sources.value -or $sources.value.Count -eq 0) {
        Write-Warning "    No data sources returned for this model."
    }
    else {
        $i = 0
        foreach ($ds in $sources.value) {
            $i++
            Write-Host ("    [{0}] Type      : {1}" -f $i, $ds.datasourceType)
            Write-Host ("        GatewayId : {0}" -f $ds.gatewayId)
            Write-Host ("        Details   : {0}" -f ($ds.connectionDetails | ConvertTo-Json -Compress))
        }
        Write-Host ("    Total data sources: {0}" -f $sources.value.Count)
    }
}

$rawDetail = Invoke-PBIRest -Url "groups/$($workspace.Id)/datasets/$($dataset.Id)" -NonFatal
if ($rawDetail) {
    $dsDetail = $rawDetail | ConvertFrom-Json
    Write-Host ("    IsOnPremGatewayRequired : {0}" -f $dsDetail.isOnPremGatewayRequired)
    Write-Host ("    TargetStorageMode       : {0}" -f $dsDetail.targetStorageMode)
}
#endregion

#region ---------- 5. Read / set MaxParallelismPerQuery (XMLA + TOM) ----------
Write-Host "[5] Connecting to the XMLA endpoint..." -ForegroundColor Cyan

$xmlaEndpoint = "$XmlaBaseUrl/$WorkspaceName"
$connStr = "Provider=MSOLAP;Data Source=$xmlaEndpoint;Initial Catalog=$DatasetName;" +
           "User ID=;Password=$accessToken;Persist Security Info=True;Impersonation Level=Impersonate;"

$server = New-Object Microsoft.AnalysisServices.Tabular.Server
try {
    $server.Connect($connStr)
    Write-Host "    Connected to $xmlaEndpoint" -ForegroundColor Green

    $db    = $server.Databases.GetByName($DatasetName)
    $model = $db.Model

    # Controls "Max DirectQuery parallelism" (concurrent queries), NOT the
    # per-data-source connection cap and NOT the per-model connection ceiling.
    # Documented requirement: compatibility level 1569 or above.
    $propName            = 'MaxParallelismPerQuery'
    $requiredCompatLevel = 1569

    $currentCompat = $db.CompatibilityLevel
    Write-Host ("    Database compatibility level : {0}" -f $currentCompat) -ForegroundColor Yellow

    if (-not $model.PSObject.Properties[$propName]) {
        throw "Property '$propName' is not exposed by this model build. Cannot read or set the value."
    }

    $current = $model.$propName
    if ($current -eq 0 -and $skuLimit) {
        Write-Host ("    Current {0} : 0  (not set - SKU default of {1} applies)" -f $propName, $skuLimit.ParallelismDefault) -ForegroundColor Yellow
    }
    else {
        Write-Host ("    Current {0} : {1}  (0 = not set / SKU default applies)" -f $propName, $current) -ForegroundColor Yellow
    }

    # Confirm this is actually a DirectQuery model
    $dqPartitions = @()
    foreach ($t in $model.Tables) {
        foreach ($p in $t.Partitions) {
            if ("$($p.Mode)" -match 'DirectQuery') { $dqPartitions += "$($t.Name)\$($p.Name)" }
        }
    }
    if ($dqPartitions.Count -gt 0) {
        Write-Host ("    DirectQuery partitions detected : {0}" -f $dqPartitions.Count) -ForegroundColor Green
        $dqPartitions | Select-Object -First 10 | ForEach-Object { Write-Host "        $_" }
    }
    else {
        Write-Warning "    No DirectQuery partitions found - this setting has no effect on a pure Import model."
    }

    if (-not $PSBoundParameters.ContainsKey('MaxParallelism')) {
        Write-Host "[6] Read-only run (no -MaxParallelism supplied). No changes made." -ForegroundColor Green
        if ($skuLimit -and $skuLimit.ParallelismCeiling -gt 1 -and $current -eq 0) {
            Write-Host ("    To raise the default from {0} toward the {1} ceiling of {2}, re-run with:" -f `
                        $skuLimit.ParallelismDefault, $skuName, $skuLimit.ParallelismCeiling)
            Write-Host ("      -MaxParallelism {0} -Apply" -f $skuLimit.ParallelismCeiling)
        }
    }
    elseif ($current -eq $MaxParallelism) {
        Write-Host "[6] Value already set to $MaxParallelism - nothing to do." -ForegroundColor Green
    }
    else {
        # --- Validate the requested value against the documented SKU ceiling ---
        if ($skuLimit) {
            if ($skuLimit.ParallelismCeiling -le 1) {
                throw "Refusing to set $propName on $skuName : DirectQuery parallelism is fixed at 1 for this SKU. Scale to F64 or higher first."
            }
            if ($MaxParallelism -gt $skuLimit.ParallelismCeiling) {
                $msg = "Requested $MaxParallelism exceeds the documented $skuName ceiling of $($skuLimit.ParallelismCeiling). The capacity will cap the effective value regardless of what is stored."
                if (-not $Force) { throw "$msg`nRe-run with -Force to store it anyway, or use -MaxParallelism $($skuLimit.ParallelismCeiling)." }
                Write-Warning "    $msg (proceeding because -Force was supplied)"
            }
            if ($MaxParallelism -lt $skuLimit.ParallelismDefault) {
                Write-Warning "    $MaxParallelism is BELOW the $skuName default of $($skuLimit.ParallelismDefault) - this will REDUCE query concurrency."
            }
        }

        if (-not $Apply) {
            Write-Host "[6] Preview only: would change $current -> $MaxParallelism. Re-run with -Apply to commit." -ForegroundColor Yellow
            if ($currentCompat -lt $requiredCompatLevel) {
                Write-Warning "    Blocked: compatibility level $currentCompat is below the required $requiredCompatLevel."
                Write-Warning "    Add -UpgradeCompatibilityLevel to raise it as part of the apply step."
            }
        }
        else {
            # Gate: the engine rejects the write below 1569, so handle the upgrade explicitly.
            if ($currentCompat -lt $requiredCompatLevel) {
                if (-not $UpgradeCompatibilityLevel) {
                    throw @"
Cannot set '$propName'. Database compatibility level is $currentCompat; this property requires $requiredCompatLevel or above.

Re-run with -UpgradeCompatibilityLevel to raise it to $TargetCompatibilityLevel first, e.g.:

  .\Set-PBIDirectQueryParallelism.ps1 -WorkspaceName "$WorkspaceName" -DatasetName "$DatasetName" ``
      -MaxParallelism $MaxParallelism -Apply -UpgradeCompatibilityLevel

WARNING: raising the compatibility level is IRREVERSIBLE. Back up / export the model first.
"@
                }

                Write-Warning "[6a] Raising compatibility level $currentCompat -> $TargetCompatibilityLevel. THIS IS IRREVERSIBLE."
                if (-not $Force) {
                    $answer = Read-Host "     Type YES to proceed with the compatibility level upgrade"
                    if ($answer -cne 'YES') { throw "Upgrade declined by operator. No changes made." }
                }

                $db.CompatibilityLevel = $TargetCompatibilityLevel
                $db.Update([Microsoft.AnalysisServices.UpdateOptions]::ExpandFull)
                $db.Refresh()
                $model = $db.Model
                Write-Host ("     Compatibility level now : {0}" -f $db.CompatibilityLevel) -ForegroundColor Green
            }

            Write-Host "[6] Setting $propName to $MaxParallelism..." -ForegroundColor Cyan
            $model.$propName = $MaxParallelism
            $model.SaveChanges() | Out-Null

            $db.Refresh()
            Write-Host ("    New value confirmed : {0}" -f $db.Model.$propName) -ForegroundColor Green
            Write-Host "    Validate the impact with Performance Analyzer / DAX Studio before rolling further." -ForegroundColor Green
        }
    }
}
finally {
    if ($server -and $server.Connected) { $server.Disconnect() }
}
#endregion

Write-Host "`nDone.`n" -ForegroundColor Cyan
