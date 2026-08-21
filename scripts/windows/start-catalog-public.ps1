$ErrorActionPreference = 'Stop'

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$LogDir = Join-Path $ProjectRoot 'logs'
$LogFile = Join-Path $LogDir 'catalog-public.log'

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
Set-Location $ProjectRoot

"[$(Get-Date -Format s)] Starting Produtos Shopping Rural public catalog" | Out-File -FilePath $LogFile -Append -Encoding utf8

node .\src\catalog-public-server.js *>> $LogFile
