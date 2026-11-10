# schermo.ps1 · 10/11 · elenca e imposta risoluzione e frequenza degli schermi di questo PC (Ally, G10) da lontano.
# Il risultato va in finestre/banco/schermi-<nome pc>.json, così Claude lo legge senza guardare lo schermo.
# Uso (Esegui, Win+R):
#   powershell -ep bypass -c "& ([scriptblock]::Create((irm https://mauriziotarsia-dev.github.io/finestre/pi/schermo.ps1))) elenca"
#   powershell -ep bypass -c "& ([scriptblock]::Create((irm https://mauriziotarsia-dev.github.io/finestre/pi/schermo.ps1))) imposta 3840 2160 60 \\.\DISPLAY2"
param([string]$Azione = 'elenca', [int]$W = 0, [int]$H = 0, [int]$Hz = 0, [string]$Schermo = '')

$codice = @"
using System;
using System.Runtime.InteropServices;
public class Schermi {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
    public short dmSpecVersion; public short dmDriverVersion; public short dmSize; public short dmDriverExtra; public int dmFields;
    public int dmPositionX; public int dmPositionY; public int dmDisplayOrientation; public int dmDisplayFixedOutput;
    public short dmColor; public short dmDuplex; public short dmYResolution; public short dmTTOption; public short dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
    public short dmLogPixels; public int dmBitsPerPel; public int dmPelsWidth; public int dmPelsHeight;
    public int dmDisplayFlags; public int dmDisplayFrequency; public int dmICMMethod; public int dmICMIntent; public int dmMediaType;
    public int dmDitherType; public int dmReserved1; public int dmReserved2; public int dmPanningWidth; public int dmPanningHeight;
  }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public struct DISPLAY_DEVICE {
    public int cb;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString;
    public int StateFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey;
  }
  [DllImport("user32.dll", CharSet = CharSet.Ansi)] public static extern bool EnumDisplayDevices(string lpDevice, int iDevNum, ref DISPLAY_DEVICE lpDisplayDevice, int dwFlags);
  [DllImport("user32.dll", CharSet = CharSet.Ansi)] public static extern bool EnumDisplaySettings(string deviceName, int modeNum, ref DEVMODE devMode);
  [DllImport("user32.dll", CharSet = CharSet.Ansi)] public static extern int ChangeDisplaySettingsEx(string lpszDeviceName, ref DEVMODE lpDevMode, IntPtr hwnd, int dwflags, IntPtr lParam);
}
"@
Add-Type -TypeDefinition $codice -ErrorAction SilentlyContinue

function Schermi-Attivi {
  $l = @()
  for ($i = 0; $i -lt 10; $i++) {
    $d = New-Object Schermi+DISPLAY_DEVICE; $d.cb = [Runtime.InteropServices.Marshal]::SizeOf($d)
    if (-not [Schermi]::EnumDisplayDevices($null, $i, [ref]$d, 0)) { break }
    if (($d.StateFlags -band 1) -eq 0) { continue }                    # collegato al desktop
    $m = New-Object Schermi+DEVMODE; $m.dmSize = [Runtime.InteropServices.Marshal]::SizeOf($m)
    [void][Schermi]::EnumDisplaySettings($d.DeviceName, -1, [ref]$m)    # quella attuale
    $mon = New-Object Schermi+DISPLAY_DEVICE; $mon.cb = [Runtime.InteropServices.Marshal]::SizeOf($mon)
    [void][Schermi]::EnumDisplayDevices($d.DeviceName, 0, [ref]$mon, 0)
    $modi = @{}
    for ($k = 0; $k -lt 2000; $k++) {
      $x = New-Object Schermi+DEVMODE; $x.dmSize = [Runtime.InteropServices.Marshal]::SizeOf($x)
      if (-not [Schermi]::EnumDisplaySettings($d.DeviceName, $k, [ref]$x)) { break }
      if ($x.dmPelsWidth -ge 1280) { $modi["$($x.dmPelsWidth)x$($x.dmPelsHeight)@$($x.dmDisplayFrequency)"] = 1 }
    }
    $l += [ordered]@{ nome = $d.DeviceName; scheda = $d.DeviceString; monitor = $mon.DeviceString; principale = (($d.StateFlags -band 4) -ne 0);
      ora = "$($m.dmPelsWidth)x$($m.dmPelsHeight)@$($m.dmDisplayFrequency)"; pos = "$($m.dmPositionX),$($m.dmPositionY)"; modi = @($modi.Keys | Sort-Object) }
  }
  return $l
}

$esito = ''
if ($Azione -eq 'imposta') {
  $m = New-Object Schermi+DEVMODE; $m.dmSize = [Runtime.InteropServices.Marshal]::SizeOf($m)
  [void][Schermi]::EnumDisplaySettings($Schermo, -1, [ref]$m)
  $m.dmPelsWidth = $W; $m.dmPelsHeight = $H; $m.dmDisplayFrequency = $Hz
  $m.dmFields = 0x80000 -bor 0x100000 -bor 0x400000                    # larghezza, altezza, frequenza
  $r = [Schermi]::ChangeDisplaySettingsEx($Schermo, [ref]$m, [IntPtr]::Zero, 0x1, [IntPtr]::Zero)   # 1 = anche nel registro
  $esito = "imposta $Schermo ${W}x${H}@${Hz}: $r (0 = fatto, 1 = serve riavvio, negativo = non accettato)"
  Start-Sleep -Seconds 3
}

$st = [ordered]@{ quando = (Get-Date).ToUniversalTime().ToString('o'); pc = $env:COMPUTERNAME; azione = $Azione; esito = $esito; schermi = @(Schermi-Attivi) }
$json = $st | ConvertTo-Json -Depth 5
$chiave = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sY2Z2Z2hqZnp5YXpvZ2ZzamJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NTEyMjAsImV4cCI6MjA5MTQyNzIyMH0.hw1jx9Jzoi2YVdEghS4nT4BW4RKSmv6qLT93buxeoUc'
$nome = ($env:COMPUTERNAME -replace '[^A-Za-z0-9-]', '').ToLower()
Invoke-RestMethod -Method Post -Uri "https://olcfvghjfzyazogfsjbk.supabase.co/storage/v1/object/dmaster-media/finestre/banco/schermi-$nome.json" `
  -Headers @{ apikey = $chiave; Authorization = "Bearer $chiave"; 'x-upsert' = 'true' } -ContentType 'image/png' -Body ([Text.Encoding]::UTF8.GetBytes($json)) | Out-Null
$json
