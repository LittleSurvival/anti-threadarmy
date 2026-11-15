param([string]$NamePrefix = "anti-threadarmy")

$ErrorActionPreference = "Stop"
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python)) { $python = "python" }
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "../..")).Path
$temporaryRoot = [IO.Path]::GetFullPath((Join-Path $repositoryRoot ".tmp"))
$buildRoot = [IO.Path]::GetFullPath((Join-Path $temporaryRoot "python-build"))
if (-not $buildRoot.StartsWith($temporaryRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Build intermediates must stay in the repository .tmp directory"
}
$workPath = Join-Path $buildRoot "work"
$specPath = Join-Path $buildRoot "spec"
$distPath = Join-Path $PSScriptRoot "dist"
New-Item -ItemType Directory -Path $workPath, $specPath -Force | Out-Null
$buildSucceeded = $false
Push-Location $PSScriptRoot
try {
    pnpm --filter @anti-threadarmy/python-gui build
    if ($LASTEXITCODE -ne 0) { throw "GUI build failed" }
    & $python -X utf8 -B -m unittest discover -s tests -t . -p "test_*.py"
    if ($LASTEXITCODE -ne 0) { throw "Python tests failed" }
    & $python -X utf8 -B -m tests.check_gui_browser
    if ($LASTEXITCODE -ne 0) { throw "GUI browser smoke test failed" }
    $appIcon = (Resolve-Path -LiteralPath assets/app.ico).Path
    $guiAssets = (Resolve-Path -LiteralPath gui/dist).Path
    & $python -X utf8 -B -m PyInstaller --noconfirm --onefile --console --icon $appIcon --name "$NamePrefix-headless" --workpath $workPath --specpath $specPath --distpath $distPath src/threads_account_headless.py
    if ($LASTEXITCODE -ne 0) { throw "Headless EXE build failed" }
    & $python -X utf8 -B -m PyInstaller --noconfirm --onefile --windowed --icon $appIcon --name "$NamePrefix-gui" --workpath $workPath --specpath $specPath --distpath $distPath --add-data "${guiAssets}:gui/dist" src/threads_account_gui.py
    if ($LASTEXITCODE -ne 0) { throw "GUI EXE build failed" }
    & ".\dist\$NamePrefix-headless.exe" --help
    if ($LASTEXITCODE -ne 0) { throw "Headless EXE smoke test failed" }
    $buildSucceeded = $true
} finally {
    Pop-Location
    if ($buildSucceeded -and (Test-Path -LiteralPath $buildRoot)) {
        Remove-Item -LiteralPath $buildRoot -Recurse -Force
    }
}
