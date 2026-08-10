#Requires -Version 5.1
<#
.SYNOPSIS
  Builds CloakDLP-Setup.msi: static-exports the console frontend, packages the console backend
  as a standalone exe (PyInstaller), publishes the agent and tray notifier as self-contained
  exes, downloads WinSW to wrap the backend as a Windows service, zips the browser extension
  source for store submission, and builds the MSI with WiX.

.NOTES
  Requires: Node/npm, Python (with console-backend/.venv already created and
  `pip install -r requirements.txt`), .NET 10 SDK, and the WiX CLI:
    dotnet tool install --global wix --version 5.0.2
    wix extension add --global WixToolset.UI.wixext/5.0.2
    wix extension add --global WixToolset.Util.wixext/5.0.2
  Must be run on Windows (uses win-x64 publish targets and Win32 APIs throughout the agent).
#>

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$installerDir = Join-Path $root "installer"
$stagingDir = Join-Path $installerDir "staging"
$outDir = Join-Path $installerDir "out"

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

# 1. Frontend static export
Step "Building console frontend (static export)"
Push-Location (Join-Path $root "console-frontend")
npm install
npm run build
Pop-Location

# 2. Backend standalone exe
Step "Packaging console backend (PyInstaller)"
Push-Location (Join-Path $root "console-backend")
if (-not (Test-Path ".venv")) { throw "console-backend\.venv not found - create it and pip install -r requirements.txt first." }
& ".venv\Scripts\python.exe" -m pip install --quiet pyinstaller
Remove-Item -Recurse -Force build, dist -ErrorAction SilentlyContinue
& ".venv\Scripts\python.exe" -m PyInstaller --onefile --name CloakDLP-Console --distpath dist --workpath build --clean `
    --hidden-import passlib.handlers.bcrypt `
    run_server.py
Pop-Location

# 3. Agent self-contained publish
Step "Publishing agent (self-contained single-file)"
Push-Location (Join-Path $root "agent\CloakDlp.Agent")
Remove-Item -Recurse -Force publish -ErrorAction SilentlyContinue
dotnet publish -c Release -r win-x64 --self-contained true `
    -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o publish
Pop-Location

# 4. Tray notifier self-contained publish
Step "Publishing tray notifier (self-contained single-file)"
Push-Location (Join-Path $root "agent\CloakDlp.Tray")
Remove-Item -Recurse -Force publish -ErrorAction SilentlyContinue
dotnet publish -c Release -r win-x64 --self-contained true `
    -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o publish
Pop-Location

# 5. WinSW (wraps the backend exe as a real Windows service - see ARCHITECTURE.md)
Step "Fetching WinSW service wrapper"
$winswPath = Join-Path $installerDir "WinSW-x64.exe"
if (-not (Test-Path $winswPath)) {
    Invoke-WebRequest -Uri "https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe" -OutFile $winswPath
}

# 6. Assemble staging directory
Step "Assembling staging directory"
Remove-Item -Recurse -Force $stagingDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$stagingDir\console", "$stagingDir\agent", "$stagingDir\tray" | Out-Null

Copy-Item "$root\console-backend\dist\CloakDLP-Console.exe" "$stagingDir\console\"
Copy-Item "$root\console-frontend\out" "$stagingDir\console\static" -Recurse
Copy-Item $winswPath "$stagingDir\console\CloakDLPConsoleService.exe"
Copy-Item "$installerDir\CloakDLPConsoleService.xml" "$stagingDir\console\"
Copy-Item "$installerDir\cloakdlp.ico" "$stagingDir\console\"

Copy-Item "$root\agent\CloakDlp.Agent\publish\CloakDlp.Agent.exe" "$stagingDir\agent\"
Copy-Item "$root\agent\CloakDlp.Agent\publish\appsettings.json" "$stagingDir\agent\"

Copy-Item "$root\agent\CloakDlp.Tray\publish\CloakDlp.Tray.exe" "$stagingDir\tray\"
Copy-Item "$root\agent\CloakDlp.Tray\publish\appsettings.json" "$stagingDir\tray\"
Copy-Item "$root\agent\CloakDlp.Tray\tray.ico" "$stagingDir\tray\"

# Not installed or force-registered anywhere - just the source, zipped up for whoever submits
# it to the Chrome Web Store / Edge Add-ons (see browser-extension/README.md). The console's
# install prompt (ExtensionInstallBanner) links to the published listing once that's done.
Compress-Archive -Path "$root\browser-extension\*" -DestinationPath "$stagingDir\CloakDLP-browser-extension.zip" -Force

@"
[InternetShortcut]
URL=http://127.0.0.1:8123/
IconFile=C:\Program Files\CloakDLP\console\cloakdlp.ico
IconIndex=0
"@ | Out-File -Encoding ascii "$stagingDir\CloakDLP Console.url"

# 7. Build the MSI
Step "Building MSI with WiX"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
Push-Location $installerDir
wix build CloakDLP.wxs -arch x64 `
    -ext WixToolset.UI.wixext/5.0.2 -ext WixToolset.Util.wixext/5.0.2 `
    -out "$outDir\CloakDLP-Setup.msi"
Pop-Location

Step "Done: installer\out\CloakDLP-Setup.msi"
