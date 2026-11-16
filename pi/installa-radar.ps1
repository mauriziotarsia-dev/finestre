# installa-radar.ps1 · 16/11 · il ricevitore del radar (pi/sensore.py) sul computer del TV: oggi la ROG Ally.
# Il radar non si collega al computer: la schedina ESP32 accanto al radar manda le letture sul Wi-Fi di casa
# (broadcast UDP 47250; se Windows lo blocca, il ricevitore si collega lui alla schedina sulla TCP 47251).
# sensore.py le offre alla pagina del TV su http://localhost:8788/persone.
# Uso (Esegui, Win+R):
#   powershell -ep bypass -c "& ([scriptblock]::Create((irm https://mauriziotarsia-dev.github.io/finestre/pi/installa-radar.ps1)))"
# Se Windows chiede se Python può usare la rete: «Consenti» lo decide Maurizio. Se lo chiude, funziona lo stesso (via TCP).
# Com'è andata: finestre/banco/radar-<pc>.json (lo legge Claude). Non cambia impostazioni di Windows: legge soltanto
# il tipo di rete (privata o pubblica) e le regole del firewall per Python.
$ErrorActionPreference = 'Continue'
$log = New-Object System.Collections.Generic.List[string]
function Passo($t){ $log.Add((Get-Date -Format 'HH:mm:ss') + ' ' + $t); Write-Host "== $t" -ForegroundColor Yellow }
$chiave = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sY2Z2Z2hqZnp5YXpvZ2ZzamJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NTEyMjAsImV4cCI6MjA5MTQyNzIyMH0.hw1jx9Jzoi2YVdEghS4nT4BW4RKSmv6qLT93buxeoUc'
$nome = ($env:COMPUTERNAME -replace '[^A-Za-z0-9-]', '').ToLower()
$extra = [ordered]@{}
function Rapporto($stato){
  $j = [ordered]@{ quando = (Get-Date).ToUniversalTime().ToString('o'); pc = $env:COMPUTERNAME; stato = $stato; passi = $log; dettagli = $extra } | ConvertTo-Json -Depth 6
  try { Invoke-RestMethod -Method Post -Uri "https://olcfvghjfzyazogfsjbk.supabase.co/storage/v1/object/dmaster-media/finestre/banco/radar-$nome.json" `
    -Headers @{ apikey = $chiave; Authorization = "Bearer $chiave"; 'x-upsert' = 'true' } -ContentType 'image/png' -Body ([Text.Encoding]::UTF8.GetBytes($j)) | Out-Null } catch {}
}
Rapporto 'inizio'

Passo 'Python'
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
$py = (Get-Command py -ErrorAction SilentlyContinue).Source
if (-not $py) { $py = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe' }
if (-not (Test-Path $py)) {
  winget install --id Python.Python.3.12 -e --silent --scope user --accept-source-agreements --accept-package-agreements 2>&1 | Select-Object -Last 2 | ForEach-Object { Passo "  python: $_" }
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  $py = (Get-Command py -ErrorAction SilentlyContinue).Source
}
Passo "python: $py"
$pyw = if ($py -like '*py.exe') { 'pyw -3.12' } else { '"' + ($py -replace 'python\.exe$', 'pythonw.exe') + '"' }

Passo 'Il ricevitore'
$Cartella = Join-Path $env:LOCALAPPDATA 'IllusionistRadar'
New-Item -ItemType Directory -Force -Path $Cartella | Out-Null
try { Invoke-WebRequest -UseBasicParsing https://mauriziotarsia-dev.github.io/finestre/pi/sensore.py -OutFile (Join-Path $Cartella 'sensore.py'); Passo 'sensore.py scaricato' } catch { Passo "sensore.py: $_" }

Passo 'Avvio automatico (scarica la versione nuova a ogni avvio)'
$cmd = @"
@echo off
rem Illusionist · ricevitore del radar per la prospettiva viva del TV
cd /d "$Cartella"
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing https://mauriziotarsia-dev.github.io/finestre/pi/sensore.py -OutFile sensore.py } catch {}"
start "" /min $pyw sensore.py
"@
$avvio = Join-Path ([Environment]::GetFolderPath('Startup')) 'Illusionist Radar.cmd'
Set-Content -Encoding ASCII -Path $avvio -Value $cmd
Passo "avvio: $avvio"

Passo 'Parte adesso (se Windows chiede per la rete, decidi tu: funziona in tutti e due i casi)'
Get-CimInstance Win32_Process -Filter "Name like 'python%' or Name like 'py%.exe'" | Where-Object { $_.CommandLine -like '*sensore.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Process -FilePath $avvio -WindowStyle Minimized
Start-Sleep -Seconds 8
try { $extra.ricevitore = Invoke-RestMethod -TimeoutSec 4 http://localhost:8788/stato; Passo ('ricevitore: ' + ($extra.ricevitore | ConvertTo-Json -Compress)) } catch { Passo "ricevitore non risponde: $_" }

Passo 'Come è messa la rete (solo lettura)'
try { $extra.reti = @(Get-NetConnectionProfile | ForEach-Object { [ordered]@{ nome = $_.Name; scheda = $_.InterfaceAlias; tipo = "$($_.NetworkCategory)" } }) } catch {}
try { $extra.indirizzi = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { "$($_.InterfaceAlias) $($_.IPAddress)/$($_.PrefixLength)" }) } catch {}
try { $extra.firewallPython = @(Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue | Where-Object { $_.Program -like '*python*' } | ForEach-Object {
    $r = $_ | Get-NetFirewallRule; [ordered]@{ programma = $_.Program; regola = $r.DisplayName; attiva = "$($r.Enabled)"; azione = "$($r.Action)"; profili = "$($r.Profile)"; verso = "$($r.Direction)" } }) } catch {}
try { $extra.avvio = @(Get-ChildItem ([Environment]::GetFolderPath('Startup')) | ForEach-Object { $_.Name }) } catch {}
try { $extra.attivita = @(Get-ScheduledTask -TaskName 'Illusionist*' -ErrorAction SilentlyContinue | ForEach-Object { "$($_.TaskName): $($_.Actions.Execute)" }) } catch {}
$vivo = @(Get-CimInstance Win32_Process -Filter "Name like 'python%' or Name like 'py%.exe'" | Where-Object { $_.CommandLine -like '*sensore.py*' }).Count
Passo "processi del ricevitore: $vivo"
Rapporto ($(if ($extra.ricevitore) { 'fatto' } else { 'non risponde' }))
