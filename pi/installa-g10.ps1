<#
  installa-g10.ps1 — prepara il mini PC GMKtec G10 che sta dietro il TV 65" (la vista verso est).

  Che cosa fa, una volta sola (si può rifare: aggiorna senza rompere):
    1. installa Git, Python 3.12 e FFmpeg (winget);
    2. scarica il programma delle finestre in C:\Users\<tu>\finestre;
    3. installa i pacchetti Python, compreso l'ingrandimento AI (Real-ESRGAN sulla Radeon del G10);
    4. all'accesso a Windows fa partire da solo:
         · il ricevitore del radar (pi\sensore.py), per la prospettiva viva sul TV;
         · la rifinitura dei video e l'ingrandimento AI (pi\cuci-animazione.py, «forza 3»: è il più potente di casa);
         · il TV: Edge a tutto schermo sulla pagina della finestra con &vista=est;
    5. toglie la sospensione, così il TV non si spegne da solo.

  Come si usa (sabato, sul G10 collegato al TV):
    · tasto destro sul menu Start → «Terminale (amministratore)», poi:
        Set-ExecutionPolicy -Scope Process Bypass
        irm https://raw.githubusercontent.com/mauriziotarsia-dev/finestre/main/pi/installa-g10.ps1 -OutFile $env:TEMP\installa-g10.ps1
        & $env:TEMP\installa-g10.ps1
    · quando Windows chiede se lasciare usare la rete a Python, rispondi Consenti (reti private): serve al radar.
  Le cose che restano a te, nelle impostazioni di Windows: TV a 3840×2160 e 60 Hz (Impostazioni → Schermo),
  e l'accesso automatico senza password se vuoi che dopo una mancanza di corrente riparta tutto da solo.
#>
param(
  [string]$Casa = 'bbb55e2f-69f4-4522-9c19-e940637e90c1',
  [int]$TvX = 2600,   # dove sta il centro del TV rispetto al radar, in mm (x: verso destra guardando le finestrelle)
  [int]$TvY = 1800    #                                                      (y: dal muro delle finestrelle verso la stanza)
)
$ErrorActionPreference = 'Stop'
$Cartella = Join-Path $env:USERPROFILE 'finestre'
function Passo($t) { Write-Host "`n== $t" -ForegroundColor Yellow }

Passo 'Programmi: Git, Python 3.12, FFmpeg'
foreach ($id in 'Git.Git', 'Python.Python.3.12', 'Gyan.FFmpeg') {
  winget install --id $id -e --silent --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) { Write-Host "  (${id}: già installato, oppure da controllare)" }
}
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

Passo 'Il programma delle finestre'
if (Test-Path (Join-Path $Cartella '.git')) { git -C $Cartella pull --ff-only } else { git clone https://github.com/mauriziotarsia-dev/finestre $Cartella }

Passo "Pacchetti Python (con l'ingrandimento AI)"
py -3.12 -m pip install --upgrade opencv-python numpy realesrgan-ncnn-py

Passo 'Prova del radar e della rete (se Windows chiede, rispondi Consenti)'
$prova = Start-Process py -ArgumentList '-3.12', (Join-Path $Cartella 'pi\sensore.py') -PassThru -WindowStyle Minimized
Start-Sleep -Seconds 12
if (-not $prova.HasExited) { Stop-Process -Id $prova.Id -Force }

Passo 'Avvio automatico'
$Url = "https://mauriziotarsia-dev.github.io/finestre/finestra/?casa=$Casa&vista=est&tvx=$TvX&tvy=$TvY"
$Edge = Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $Edge)) { $Edge = Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe' }
$Avvio = Join-Path $Cartella 'avvio-g10.cmd'
@"
@echo off
rem Illusionist sul G10: aggiorna il programma, poi radar, rifinitura dei video e il TV
cd /d "$Cartella"
git pull --ff-only >nul 2>&1
start "" /min pyw -3.12 pi\sensore.py
start "" /min pyw -3.12 pi\cuci-animazione.py --casa $Casa --forza 3 --chi g10
start "" "$Edge" --kiosk "$Url" --edge-kiosk-type=fullscreen --no-first-run --autoplay-policy=no-user-gesture-required --user-data-dir="%LOCALAPPDATA%\IllusionistTV"
"@ | Set-Content -Encoding ASCII $Avvio
$azione = New-ScheduledTaskAction -Execute $Avvio
$quando = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
Register-ScheduledTask -TaskName 'Illusionist TV' -Action $azione -Trigger $quando -RunLevel Limited -Force | Out-Null

Passo 'Mai in sospensione'
powercfg /change standby-timeout-ac 0
powercfg /change monitor-timeout-ac 0
powercfg /change hibernate-timeout-ac 0

Passo 'Fatto. Parte tutto adesso (e da ora a ogni accesso).'
Start-Process $Avvio
