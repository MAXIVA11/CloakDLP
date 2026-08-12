#Requires -Version 5.1
<#
.SYNOPSIS
  Signs a single file in place via SignPath's REST API (https://about.signpath.io). No-op if
  SignPath isn't configured, so local/dev builds keep working unsigned exactly as before -
  signing only happens when the SIGNPATH_* environment variables below are all set (CI release
  builds, or a local run with those exported deliberately).

.NOTES
  Required environment variables:
    SIGNPATH_API_TOKEN            API token with signing-request permission
    SIGNPATH_ORGANIZATION_ID      SignPath organization id (GUID)
    SIGNPATH_PROJECT_SLUG         Project slug for CloakDLP
    SIGNPATH_SIGNING_POLICY_SLUG  Signing Policy slug to sign under (e.g. release-signing)
    SIGNPATH_ARTIFACT_CONFIG_SLUG Artifact Configuration slug for Windows exe/msi artifacts

  Uses System.Net.Http directly (not Invoke-RestMethod -Form) specifically because -Form is a
  PowerShell 7+ only parameter; build.ps1 targets Windows PowerShell 5.1, and this needs to run
  under whatever shell invokes it without silently requiring an upgrade.

  WaitFor=Completion makes the request synchronous: SignPath signs and returns the signed
  artifact directly in the response body once its policy's approval step (if any) clears. A free
  open-source signing policy commonly requires no manual approval per request, but if yours does,
  this will sit waiting up to the timeout below - check the SignPath dashboard if it times out.

  Field/endpoint names here follow SignPath's documented REST API shape as of when this was
  written; this has not yet been exercised against a live SignPath project, so verify against
  https://about.signpath.io/documentation/rest-api once real credentials exist, and expect to
  adjust a field name or two on the first real signing run.
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath
)

function Test-SignPathConfigured {
    return [bool]($env:SIGNPATH_API_TOKEN -and $env:SIGNPATH_ORGANIZATION_ID -and $env:SIGNPATH_PROJECT_SLUG `
        -and $env:SIGNPATH_SIGNING_POLICY_SLUG -and $env:SIGNPATH_ARTIFACT_CONFIG_SLUG)
}

function Invoke-SignPathSigning {
    param([string]$FilePath)

    Add-Type -AssemblyName System.Net.Http

    $httpClient = New-Object System.Net.Http.HttpClient
    try {
        $httpClient.Timeout = [TimeSpan]::FromMinutes(10)
        $httpClient.DefaultRequestHeaders.Authorization = `
            New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $env:SIGNPATH_API_TOKEN)

        $form = New-Object System.Net.Http.MultipartFormDataContent
        $form.Add((New-Object System.Net.Http.StringContent($env:SIGNPATH_PROJECT_SLUG)), "ProjectSlug")
        $form.Add((New-Object System.Net.Http.StringContent($env:SIGNPATH_SIGNING_POLICY_SLUG)), "SigningPolicySlug")
        $form.Add((New-Object System.Net.Http.StringContent($env:SIGNPATH_ARTIFACT_CONFIG_SLUG)), "ArtifactConfigurationSlug")

        $fileBytes = [System.IO.File]::ReadAllBytes($FilePath)
        $fileContent = New-Object System.Net.Http.ByteArrayContent(, $fileBytes)
        $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/octet-stream")
        $form.Add($fileContent, "Artifact", [System.IO.Path]::GetFileName($FilePath))

        $uri = "https://app.signpath.io/API/v1/$($env:SIGNPATH_ORGANIZATION_ID)/SigningRequests?WaitFor=Completion"
        $response = $httpClient.PostAsync($uri, $form).GetAwaiter().GetResult()

        if (-not $response.IsSuccessStatusCode) {
            $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            throw "SignPath signing failed ($([int]$response.StatusCode) $($response.StatusCode)): $body"
        }

        $signedBytes = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
        [System.IO.File]::WriteAllBytes($FilePath, $signedBytes)
    }
    finally {
        $httpClient.Dispose()
    }
}

if (-not (Test-SignPathConfigured)) {
    Write-Host "  (SignPath not configured - $FilePath left unsigned; set SIGNPATH_* env vars to sign)" -ForegroundColor DarkYellow
    return
}

Write-Host "  signing $FilePath via SignPath..." -ForegroundColor Cyan
Invoke-SignPathSigning -FilePath $FilePath
Write-Host "  signed: $FilePath" -ForegroundColor Green
