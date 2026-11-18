param(
    [string]$Version = "1.0.0",
    [switch]$SkipZip
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# Ensure local portable toolchains are in PATH if installed in user profile
if (Test-Path "$env:USERPROFILE\.dotnet\dotnet.exe") {
    $env:DOTNET_ROOT = "$env:USERPROFILE\.dotnet"
    $env:PATH = "$env:USERPROFILE\.dotnet;$env:PATH"
}
if (Test-Path "$env:USERPROFILE\.node\node.exe") {
    $env:PATH = "$env:USERPROFILE\.node;$env:PATH"
}

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " Remnant 2 Build & Loot Overseer v$Version - Portable Release Builder" -ForegroundColor Cyan
Write-Host " License: GNU GPL-3.0 | Target: win-x64 (Self-Contained)" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

$FrontendDir = Join-Path $RepoRoot "BuildLootOverseer.Frontend"
$BackendProj = Join-Path $RepoRoot "BuildLootOverseer.Backend\BuildLootOverseer.Backend.csproj"
$ReleaseRoot = Join-Path $RepoRoot "release"
$PackageName = "Remnant2-BuildLootOverseer-v$Version-win-x64"
$StageDir    = Join-Path $ReleaseRoot $PackageName
$ZipPath     = Join-Path $ReleaseRoot "$PackageName.zip"

# 1. Clean previous staging output
if (Test-Path $StageDir) {
    Write-Host "[1/5] Limpiando carpeta de staging previa..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $StageDir
}
if (Test-Path $ZipPath) {
    Remove-Item -Force $ZipPath
}
New-Item -ItemType Directory -Path $StageDir -Force | Out-Null

# 2. Build React + TypeScript + Tailwind Frontend
Write-Host "[2/5] Compilando interfaz Frontend (Vite + React + TypeScript)..." -ForegroundColor Yellow
Push-Location $FrontendDir
try {
    if (-not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
        npm install
    }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Fallo la compilacion del Frontend (vite build)." }
}
finally {
    Pop-Location
}

# 3. Publish Self-Contained Win-x64 Executable (No .NET SDK/Runtime needed on target PC)
Write-Host "[3/5] Publicando ejecutable nativo Self-Contained (win-x64)..." -ForegroundColor Yellow
dotnet publish $BackendProj `
    -c Release `
    -r win-x64 `
    --self-contained true `
    -p:AssemblyName=Remnant2BuildLootOverseer `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:EnableCompressionInSingleFile=true `
    -p:DebugType=None `
    -p:DebugSymbols=false `
    -o $StageDir

if ($LASTEXITCODE -ne 0) {
    throw "Fallo dotnet publish."
}

# Remove any stray .pdb, XML doc comments, or development config files if generated
Get-ChildItem -Path $StageDir -Include *.pdb, *.xml, appsettings*.json, web.config -File -ErrorAction SilentlyContinue | Remove-Item -Force

# 4. Bundle Static UI (wwwroot), Offline Catalog, Spanish Resx, Icon & Legal Notices
Write-Host "[4/5] Empaquetando catalogo offline, interfaz wwwroot, recursos ES/EN y licencia GPL-3.0..." -ForegroundColor Yellow

$WwwRoot = Join-Path $StageDir "wwwroot"
New-Item -ItemType Directory -Path $WwwRoot -Force | Out-Null
Copy-Item -Recurse -Force (Join-Path $FrontendDir "dist\*") $WwwRoot

$CatalogSrc = Join-Path $RepoRoot "data\catalog.merged.json"
if (-not (Test-Path $CatalogSrc)) {
    throw "No se encontro data\catalog.merged.json"
}
Copy-Item -Force $CatalogSrc (Join-Path $StageDir "catalog.merged.json")

$ResDest = Join-Path $StageDir "Resources"
New-Item -ItemType Directory -Path $ResDest -Force | Out-Null
foreach ($resx in @("GameStrings.es.resx", "AppStrings.es.resx")) {
    $srcResx = Join-Path $RepoRoot "RemnantOverseer\Resources\$resx"
    if (Test-Path $srcResx) {
        Copy-Item -Force $srcResx (Join-Path $ResDest $resx)
    }
}

foreach ($docFile in @("LICENSE", "THIRD_PARTY_NOTICES.md", "app-branding.json")) {
    $srcDoc = Join-Path $RepoRoot $docFile
    if (Test-Path $srcDoc) {
        Copy-Item -Force $srcDoc (Join-Path $StageDir $docFile)
    }
}

$ReadmeTxt = @"
================================================================================
 REMNANT 2 BUILD & LOOT OVERSEER v$Version (Portable Windows 10/11 x64)
 Desarrollado por / Developed by: Choppx
 Apoyar / Support: https://ko-fi.com/choppx
 Licencia / License: GNU General Public License v3.0 (GPL-3.0)
================================================================================

[ESPANOL - COMO USAR]
1. Extrae toda esta carpeta en cualquier lugar de tu PC (Escritorio, Documentos, etc.).
2. Haz doble clic en "Remnant2BuildLootOverseer.exe" (no requiere instalar .NET ni SDKs).
3. En la primera ejecucion se abrira el asistente para confirmar tu plataforma:
   - Steam (%USERPROFILE%\Saved Games\Remnant2\Steam\)
   - Epic Games (%USERPROFILE%\Saved Games\Remnant2\Epic\)
   - Xbox / PC Game Pass (contenedores UWP SystemAppData\wgs\containers.index)
4. Seguridad 100% Cero Escritura: La aplicacion JAMAS escribe ni modifica la carpeta
   de guardados del juego. Toda lectura se hace sobre copias temporales en RAM/temp
   y crea hasta 10 respaldos preventivos (.zip) automaticos en %LOCALAPPDATA%\Remnant2BuildOverseer.

[ENGLISH - QUICK START]
1. Extract this entire folder anywhere on your PC.
2. Double-click "Remnant2BuildLootOverseer.exe" (fully self-contained; no SDKs required).
3. On first launch, choose your platform (Steam, Epic Games, or Xbox / PC Game Pass)
   or browse to your custom save folder. Switch between ES | EN anytime from the top bar.
4. 100% Zero-Write Safety: This tool NEVER writes to or locks your Remnant 2 save folder.

[CREDITOS & AVISO LEGAL / CREDITS & LEGAL DISCLAIMER]
- Basado en e inspirado por / Powered by & inspired by:
  * Angelore/RemnantOverseer (https://github.com/Angelore/remnant-two-overseer)
  * joshpayette/remnant2-toolkit (https://github.com/joshpayette/remnant2-toolkit)
- ES: Herramienta fan no oficial y gratuita. No afiliada, asociada ni respaldada por Gunfire Games ni Arc Games.
- EN: Free, unofficial fan-made tool. Not affiliated with, associated with, or endorsed by Gunfire Games or Arc Games.
"@

Set-Content -Path (Join-Path $StageDir "LEEME_README.txt") -Value $ReadmeTxt -Encoding UTF8

# 5. Compress portable .zip archive ready for GitHub Releases / Nexus Mods
if (-not $SkipZip) {
    Write-Host "[5/5] Generando archivo comprimido listo para distribuir (.zip)..." -ForegroundColor Yellow
    Compress-Archive -Path "$StageDir\*" -DestinationPath $ZipPath -CompressionLevel Optimal -Force
    $zipSizeMb = [Math]::Round(((Get-Item $ZipPath).Length / 1MB), 2)
    Write-Host "[OK] Paquete portable generado con exito:" -ForegroundColor Green
    Write-Host "     Carpeta : $StageDir" -ForegroundColor Green
    Write-Host "     Archivo : $ZipPath ($zipSizeMb MB)" -ForegroundColor Green
} else {
    Write-Host "[OK] Carpeta portable generada en: $StageDir" -ForegroundColor Green
}
