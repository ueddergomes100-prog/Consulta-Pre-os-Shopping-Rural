$ErrorActionPreference = 'Stop'

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Runner = Join-Path $ProjectRoot 'scripts\windows\start-catalog-public.ps1'
$TaskName = 'Produtos Shopping Rural Catalogo'
try {
  $Action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Runner`""
  $Trigger = New-ScheduledTaskTrigger -AtLogOn
  $Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Description 'Inicia o catalogo publico Produtos Shopping Rural ao entrar no Windows.' `
    -Force | Out-Null

  Write-Host "Tarefa '$TaskName' instalada."
} catch {
  $StartupDir = [Environment]::GetFolderPath('Startup')
  $ShortcutPath = Join-Path $StartupDir 'Produtos Shopping Rural Catalogo.lnk'
  $Shell = New-Object -ComObject WScript.Shell
  $Shortcut = $Shell.CreateShortcut($ShortcutPath)
  $Shortcut.TargetPath = 'powershell.exe'
  $Shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Runner`""
  $Shortcut.WorkingDirectory = $ProjectRoot
  $Shortcut.WindowStyle = 7
  $Shortcut.Description = 'Inicia o catalogo publico Produtos Shopping Rural ao entrar no Windows.'
  $Shortcut.Save()

  Write-Host "Atalho de inicializacao criado em '$ShortcutPath'."
}
