<#
.SYNOPSIS
    Reads emails from an Outlook mail folder (default "_PrivatePreview") and exports
    Name, Description, Area, and Participation response link to a CSV for Power BI.

.DESCRIPTION
    Uses the Outlook desktop COM API (no network calls; everything stays local).
    Walks every Outlook store to locate the target folder by name, reads each mail
    item, and extracts four fields from the message body:

        - Name                        (label "Name:" in the body)
        - Description                 (label "Description:" in the body)
        - Area                        (label "Area:" in the body)
        - Participation response link (a hyperlink whose text/URL relates to
                                       participation/response, or a labeled line)

    The label patterns are configurable near the top of the script so you can tune
    them once you see how the real emails are laid out.

.PARAMETER FolderName
    Name of the Outlook folder to read. Default: "_PrivatePreview".

.PARAMETER OutputPath
    Full path of the CSV to write. Default: PrivatePreview.csv next to this script.

.PARAMETER IncludeRawBody
    When set, adds the full plain-text body as an extra column (useful for tuning
    the regex patterns if a field comes back empty).

.EXAMPLE
    .\Export-PrivatePreviewEmails.ps1

.EXAMPLE
    .\Export-PrivatePreviewEmails.ps1 -FolderName "_PrivatePreview" -IncludeRawBody
#>

[CmdletBinding()]
param(
    [string]$FolderName = "_PrivatePreview",
    [string]$OutputPath = (Join-Path $PSScriptRoot "PrivatePreview.csv"),
    [switch]$IncludeRawBody
)

# ---------------------------------------------------------------------------
# Field label patterns. Adjust these if the emails use different wording.
# Each pattern captures everything after the label up to the next line break.
# ---------------------------------------------------------------------------
$FieldPatterns = @{
    Name        = '(?im)^\s*Name\s*[:\-]\s*(.+?)\s*$'
    Description = '(?ims)^\s*Description\s*[:\-]\s*(.+?)\s*(?:\r?\n\s*(?:Name|Area|Participation)\s*[:\-]|\z)'
    Area        = '(?im)^\s*Area\s*[:\-]\s*(.+?)\s*$'
}

# Words that identify the participation/response hyperlink in the HTML body.
$ParticipationKeywords = @('participat', 'response', 'sign\s*up', 'register', 'respond', 'interest')

# ---------------------------------------------------------------------------
function Get-FolderRecursive {
    param(
        [object]$Folders,
        [string]$TargetName
    )
    foreach ($folder in $Folders) {
        if ($folder.Name -eq $TargetName) {
            return $folder
        }
        try {
            $child = Get-FolderRecursive -Folders $folder.Folders -TargetName $TargetName
            if ($null -ne $child) { return $child }
        }
        catch {
            # Some folders (e.g. search folders) can't be enumerated; skip them.
        }
    }
    return $null
}

function Get-FieldValue {
    param(
        [string]$Body,
        [string]$Pattern
    )
    if ([string]::IsNullOrWhiteSpace($Body)) { return "" }
    $m = [regex]::Match($Body, $Pattern)
    if ($m.Success) {
        return ($m.Groups[1].Value -replace '\s+', ' ').Trim()
    }
    return ""
}

function Get-ParticipationLink {
    param(
        [string]$HtmlBody,
        [string]$PlainBody
    )

    # 1) Prefer an <a href> whose visible text or URL matches participation keywords.
    if (-not [string]::IsNullOrWhiteSpace($HtmlBody)) {
        $anchorRegex = '(?is)<a\b[^>]*?href\s*=\s*(["''])(?<url>.*?)\1[^>]*>(?<text>.*?)</a>'
        $anchors = [regex]::Matches($HtmlBody, $anchorRegex)
        foreach ($kw in $ParticipationKeywords) {
            foreach ($a in $anchors) {
                $url  = $a.Groups['url'].Value
                $text = ($a.Groups['text'].Value -replace '<[^>]+>', ' ')
                if (($text -match $kw -or $url -match $kw) -and $url -match '^https?://') {
                    return $url.Trim()
                }
            }
        }
        # Fallback: first real http link in the HTML body.
        foreach ($a in $anchors) {
            $url = $a.Groups['url'].Value
            if ($url -match '^https?://') { return $url.Trim() }
        }
    }

    # 2) Labeled line in the plain-text body, e.g. "Participation response link: http..."
    $labeled = Get-FieldValue -Body $PlainBody -Pattern '(?im)^\s*Participation(?:\s+response)?(?:\s+link)?\s*[:\-]\s*(\S+)'
    if ($labeled) { return $labeled }

    # 3) Any URL near a participation keyword in the plain-text body.
    if (-not [string]::IsNullOrWhiteSpace($PlainBody)) {
        foreach ($kw in $ParticipationKeywords) {
            $near = [regex]::Match($PlainBody, "(?is)$kw.{0,120}?(https?://\S+)")
            if ($near.Success) { return $near.Groups[1].Value.Trim() }
        }
    }

    return ""
}

# ---------------------------------------------------------------------------
Write-Host "Connecting to Outlook..." -ForegroundColor Cyan
try {
    $outlook   = New-Object -ComObject Outlook.Application
    $namespace = $outlook.GetNamespace("MAPI")
}
catch {
    Write-Error "Could not start Outlook. Make sure the Outlook desktop app is installed and configured. $_"
    return
}

Write-Host "Searching all stores for folder '$FolderName'..." -ForegroundColor Cyan
$target = $null
foreach ($store in $namespace.Stores) {
    try {
        $root = $store.GetRootFolder()
        $found = Get-FolderRecursive -Folders $root.Folders -TargetName $FolderName
        if ($null -ne $found) { $target = $found; break }
    }
    catch {
        Write-Warning "Skipping store '$($store.DisplayName)': $_"
    }
}

if ($null -eq $target) {
    Write-Error "Folder '$FolderName' was not found in any Outlook store."
    return
}

$items = $target.Items
Write-Host ("Found folder '{0}' with {1} item(s). Extracting..." -f $target.Name, $items.Count) -ForegroundColor Green

$results = New-Object System.Collections.Generic.List[object]
$index = 0

foreach ($item in $items) {
    $index++
    # Only process mail items (MessageClass starts with IPM.Note).
    if ($null -eq $item.MessageClass -or -not $item.MessageClass.StartsWith("IPM.Note")) {
        continue
    }

    $plain = ""
    $html  = ""
    try { $plain = [string]$item.Body }     catch {}
    try { $html  = [string]$item.HTMLBody } catch {}

    $record = [ordered]@{
        Name                      = Get-FieldValue -Body $plain -Pattern $FieldPatterns.Name
        Description               = Get-FieldValue -Body $plain -Pattern $FieldPatterns.Description
        Area                      = Get-FieldValue -Body $plain -Pattern $FieldPatterns.Area
        ParticipationResponseLink = Get-ParticipationLink -HtmlBody $html -PlainBody $plain
        EmailSubject              = [string]$item.Subject
        ReceivedTime              = if ($item.ReceivedTime) { $item.ReceivedTime.ToString("s") } else { "" }
        SenderName                = [string]$item.SenderName
    }

    if ($IncludeRawBody) {
        $record["RawBody"] = ($plain -replace '\s+', ' ').Trim()
    }

    $results.Add([pscustomobject]$record)
}

if ($results.Count -eq 0) {
    Write-Warning "No mail items were processed. Nothing written."
    return
}

$results | Export-Csv -Path $OutputPath -NoTypeInformation -Encoding UTF8
Write-Host ("Exported {0} record(s) to {1}" -f $results.Count, $OutputPath) -ForegroundColor Green

# Quick sanity summary of how many fields were populated.
$missing = $results | Where-Object {
    [string]::IsNullOrWhiteSpace($_.Name) -or
    [string]::IsNullOrWhiteSpace($_.Area) -or
    [string]::IsNullOrWhiteSpace($_.ParticipationResponseLink)
}
if ($missing.Count -gt 0) {
    Write-Warning ("{0} record(s) have one or more empty fields. Re-run with -IncludeRawBody to inspect the body text and tune the label patterns near the top of the script." -f $missing.Count)
}
