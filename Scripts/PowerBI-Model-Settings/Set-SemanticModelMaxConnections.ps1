# ============================================================================================
# Developed by Farhan Soomro - free community utility
# Source: https://github.com/SoomroFarhanH/SemanticModelBPforAI
# License: MIT (see LICENSE). Copyright (c) 2026 Farhan Soomro.
#
# DISCLAIMER:
# Provided "AS IS", without warranty of any kind, express or implied, including but not limited to
# the warranties of merchantability, fitness for a particular purpose, and non-infringement. This
# is a personal community project. It is not an official Microsoft product and is not supported or
# endorsed by Microsoft or any employer. Review the code and test it in a non-production
# environment before use. You use it at your own risk. In no event shall the author be liable for
# any claim, damages, data loss, service disruption, capacity or licensing cost, or other
# liability arising from its use. Results are guidance only and should be validated by a qualified
# person.
# ============================================================================================

# =====================================================================
# CONFIGURATION
# =====================================================================
$workspaceName     = "Demo"
$semanticModelName = "DQ_AutoAgg"
$newMaxConnections = 15

$newMaxConnections = 15
$tableName         = "Your_Table_Name"
$partitions        = @("Partition1", "Partition2", "Partition3") 

# =====================================================================
# SCRIPT EXECUTION
# =====================================================================

Import-Module MicrosoftPowerBIMgmt
Import-Module SqlServer

Write-Host "`nPlease log in via the prompt..." -ForegroundColor Cyan
Connect-PowerBIServiceAccount

# ---------------------------------------------------------------------
# Automatically resolve Names to IDs for the REST API
# ---------------------------------------------------------------------
Write-Host "`nLooking up Workspace and Model IDs..."
$workspace = Get-PowerBIWorkspace -Name $workspaceName
if (-not $workspace) {
    Write-Error "Could not find a workspace named '$workspaceName'."
    exit
}
$workspaceId = $workspace.Id

$dataset = Get-PowerBIDataset -WorkspaceId $workspaceId -Name $datasetName
if (-not $dataset) {
    Write-Error "Could not find a semantic model named '$datasetName' in the workspace."
    exit
}
$datasetId = $dataset.Id

# Extract the access token for TOM
$token = Get-PowerBIAccessToken -AsString
$tokenValue = $token -replace "Bearer ", ""

# ---------------------------------------------------------------------
# PART 1: Update MaxConnections Metadata via TOM 
# ---------------------------------------------------------------------
$workspaceUrl = $workspaceName -replace ' ', '%20'
$connectionString = "DataSource=powerbi://api.powerbi.com/v1.0/myorg/$workspaceUrl;Password=$tokenValue;"

try {
    Write-Host "`n--- Updating Model Metadata ---" -ForegroundColor Cyan
    $server = New-Object Microsoft.AnalysisServices.Tabular.Server
    $server.Connect($connectionString)
    
    $database = $server.Databases.FindByName($datasetName)
    if ($null -ne $database) {
        $model = $database.Model
        foreach ($dataSource in $model.DataSources) {
            $dataSource.MaxConnections = $newMaxConnections
            Write-Host "Queued update: '$($dataSource.Name)' MaxConnections = $newMaxConnections"
        }
        $model.SaveChanges()
        Write-Host "Success: MaxConnections saved to the service." -ForegroundColor Green
    }
}
finally {
    if ($null -ne $server -and $server.Connected) {
        $server.Disconnect()
    }
}

# ---------------------------------------------------------------------
# PART 2: Trigger Enhanced Refresh via REST API
# ---------------------------------------------------------------------
Write-Host "`n--- Triggering Enhanced Refresh ---" -ForegroundColor Cyan

foreach ($partition in $partitions) {
    $body = @{
        type = "Full"
        commitMode = "transactional"
        retryCount = 2
        objects = @(
            @{
                table = $tableName
                partition = $partition
            }
        )
        applyRefreshPolicy = $false
    } | ConvertTo-Json -Depth 3

    $url = "https://api.powerbi.com/v1.0/myorg/groups/$workspaceId/datasets/$datasetId/refreshes"
    
    $response = Invoke-PowerBIRestMethod -Method Post -Url $url -Body $body

    Write-Host "Triggered refresh for partition: $partition" -ForegroundColor Green
}