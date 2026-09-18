# Executar como administrador. Libera apenas o catalogo para a sub-rede local.
$ErrorActionPreference = 'Stop'
$NodePath = (Get-Command node -ErrorAction Stop).Source
$RuleName = 'ShoppingRural-Catalog-LAN-3010'
$Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$Principal = New-Object Security.Principal.WindowsPrincipal($Identity)
if (-not $Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Abra o PowerShell como administrador para liberar o acesso da rede local.'
}
if (-not (Get-NetFirewallRule -Name $RuleName -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -Name $RuleName -DisplayName 'Shopping Rural - Catalogo na rede local' `
    -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3010 `
    -RemoteAddress LocalSubnet -Program $NodePath -Profile Any | Out-Null
}
Write-Host 'Catalogo liberado na porta 3010 somente para a sub-rede local.'
