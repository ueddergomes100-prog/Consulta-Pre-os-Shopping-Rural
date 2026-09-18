param([string]$CatalogUrl = 'http://localhost:3010/catalogo')
$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$BrowserCandidates = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
)
$BrowserPath = $BrowserCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $BrowserPath) { throw 'Instale o Microsoft Edge ou o Google Chrome.' }
$Address = [uri]$CatalogUrl
if ($Address.Scheme -notin @('http', 'https')) { throw 'Endereco invalido.' }
$DesktopDir = [Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path $DesktopDir 'Produtos Shopping Rural.lnk'
$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $BrowserPath
$Shortcut.Arguments = "--app=`"$($Address.AbsoluteUri)`""
$Shortcut.WorkingDirectory = $ProjectRoot
$Shortcut.IconLocation = Join-Path $ProjectRoot 'frontend\public\pwa\shopping-rural.ico'
$Shortcut.Description = 'Consulta local de produtos, precos e estoque da Shopping Rural'
$Shortcut.Save()
Write-Host "Atalho em janela criado: $ShortcutPath"
