# installa-cucitore.ps1 · 10/11 · la rifinitura dei video (cuci-animazione.py) su un PC degli schermi: ROG Ally (forza 3)
# e G10 (forza 2). Lo fa il più forte acceso; l'altro solo se il primo non c'è (vedi giro_casa in cuci-animazione.py).
# Maurizio: «diamo la priorità alla cucitura ed alla qualità» → priorità normale, tutti i processori, ingrandimento AI.
# Uso (Esegui, Win+R):
#   powershell -ep bypass -c "& ([scriptblock]::Create((irm https://mauriziotarsia-dev.github.io/finestre/pi/installa-cucitore.ps1))) 3 ally"
# Com'è andata: finestre/banco/cucitore-<pc>.json (lo legge Claude).
param([int]$Forza = 3, [string]$Chi = 'pc', [string]$Casa = 'bbb55e2f-69f4-4522-9c19-e940637e90c1')

$ErrorActionPreference = 'Continue'
$log = New-Object System.Collections.Generic.List[string]
function Passo($t){ $log.Add((Get-Date -Format 'HH:mm:ss') + ' ' + $t); Write-Host "== $t" -ForegroundColor Yellow }
$chiave = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sY2Z2Z2hqZnp5YXpvZ2ZzamJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NTEyMjAsImV4cCI6MjA5MTQyNzIyMH0.hw1jx9Jzoi2YVdEghS4nT4BW4RKSmv6qLT93buxeoUc'
$nome = ($env:COMPUTERNAME -replace '[^A-Za-z0-9-]', '').ToLower()
function Rapporto($stato){
  $j = [ordered]@{ quando = (Get-Date).ToUniversalTime().ToString('o'); pc = $env:COMPUTERNAME; stato = $stato; passi = $log } | ConvertTo-Json -Depth 4
  try { Invoke-RestMethod -Method Post -Uri "https://olcfvghjfzyazogfsjbk.supabase.co/storage/v1/object/dmaster-media/finestre/banco/cucitore-$nome.json" `
    -Headers @{ apikey = $chiave; Authorization = "Bearer $chiave"; 'x-upsert' = 'true' } -ContentType 'image/png' -Body ([Text.Encoding]::UTF8.GetBytes($j)) | Out-Null } catch {}
}
Rapporto 'inizio'

$Cartella = Join-Path $env:LOCALAPPDATA 'IllusionistCucitore'
New-Item -ItemType Directory -Force -Path $Cartella | Out-Null

Passo 'Python 3.12 e FFmpeg'
foreach ($id in 'Python.Python.3.12', 'Gyan.FFmpeg') {
  winget install --id $id -e --silent --scope user --accept-source-agreements --accept-package-agreements 2>&1 | Select-Object -Last 2 | ForEach-Object { Passo "  ${id}: $_" }
}
# il PATH nuovo (ffmpeg, py) vale da subito anche qui
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
$py = (Get-Command py -ErrorAction SilentlyContinue).Source
if (-not $py) { $py = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe' }
Passo "python: $py"
$ff = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
if (-not $ff) { $ff = (Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages') -Recurse -Filter ffmpeg.exe -ErrorAction SilentlyContinue | Select-Object -First 1).FullName }
Passo "ffmpeg: $ff"
Rapporto 'programmi'

Passo 'Pacchetti Python (opencv, numpy, ingrandimento AI)'
# @(...) fuori dall'if: altrimenti PowerShell lo srotola in una stringa e lo splatting la spezza in lettere (- 3 . 1 2)
$pyArgs = @(if ($py -like '*py.exe') { '-3.12' })
& $py @pyArgs -m pip install --upgrade --quiet opencv-python numpy realesrgan-ncnn-py 2>&1 | Select-Object -Last 3 | ForEach-Object { Passo "  pip: $_" }
& $py @pyArgs -c "import cv2, numpy; from realesrgan_ncnn_py import Realesrgan; print('ok', cv2.__version__)" 2>&1 | ForEach-Object { Passo "  prova: $_" }
Rapporto 'pacchetti'

# il cucitore lavora sulla libreria del link della stanza (finestre/<cartella>): un vecchio abbinamento alla stanza privata
# lo porterebbe altrove, quindi si mette da parte (si può rimettere rinominando il file)
$acc = Join-Path $env:USERPROFILE '.cucitore-accesso.json'
if (Test-Path $acc) { Move-Item -Force $acc ($acc + '.messo-da-parte'); Passo 'abbinamento vecchio messo da parte' }

Passo 'Avvio automatico (scarica la versione nuova a ogni avvio)'
$pyw = if ($py -like '*py.exe') { 'pyw -3.12' } else { '"' + ($py -replace 'python\.exe$', 'pythonw.exe') + '"' }
$ffDir = if ($ff) { Split-Path $ff } else { '' }
$cmd = @"
@echo off
rem Illusionist · rifinitura dei video (forza $Forza): lo fa il più forte acceso fra Ally e G10
cd /d "$Cartella"
set PATH=$ffDir;%PATH%
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing https://mauriziotarsia-dev.github.io/finestre/pi/cuci-animazione.py -OutFile cuci-animazione.py } catch {}"
start "" /min $pyw cuci-animazione.py --casa $Casa --forza $Forza --chi $Chi --pieno
"@
$avvio = Join-Path ([Environment]::GetFolderPath('Startup')) 'Illusionist Cucitore.cmd'
Set-Content -Encoding ASCII -Path $avvio -Value $cmd
Passo "avvio: $avvio"

Passo 'Parte adesso'
Get-CimInstance Win32_Process -Filter "Name like 'python%'" | Where-Object { $_.CommandLine -like '*cuci-animazione*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Process -FilePath $avvio -WindowStyle Minimized
Start-Sleep -Seconds 25
$vivo = @(Get-CimInstance Win32_Process -Filter "Name like 'python%'" | Where-Object { $_.CommandLine -like '*cuci-animazione*' }).Count
Passo "processi del cucitore: $vivo"
Rapporto ($(if ($vivo) { 'fatto' } else { 'non parte' }))
