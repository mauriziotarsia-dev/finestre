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
  /* tutto in C#: le strutture passate da PowerShell per riferimento non tornavano piene */
  public static string Elenco(){
    var sb = new System.Text.StringBuilder();
    for (int i = 0; i < 10; i++){
      var d = new DISPLAY_DEVICE(); d.cb = Marshal.SizeOf(d);
      if (!EnumDisplayDevices(null, i, ref d, 0)) break;
      if ((d.StateFlags & 1) == 0) continue;
      var m = new DEVMODE(); m.dmSize = (short)Marshal.SizeOf(m);
      EnumDisplaySettings(d.DeviceName, -1, ref m);
      var mon = new DISPLAY_DEVICE(); mon.cb = Marshal.SizeOf(mon); EnumDisplayDevices(d.DeviceName, 0, ref mon, 0);
      sb.Append(d.DeviceName + "|" + d.DeviceString + "|" + mon.DeviceString + "|" + ((d.StateFlags & 4) != 0 ? "principale" : "") + "|ora " + m.dmPelsWidth + "x" + m.dmPelsHeight + "@" + m.dmDisplayFrequency + "|pos " + m.dmPositionX + "," + m.dmPositionY + "|modi");
      var visti = new System.Collections.Generic.HashSet<string>();
      for (int k = 0; k < 3000; k++){
        var x = new DEVMODE(); x.dmSize = (short)Marshal.SizeOf(x);
        if (!EnumDisplaySettings(d.DeviceName, k, ref x)) break;
        string t = x.dmPelsWidth + "x" + x.dmPelsHeight + "@" + x.dmDisplayFrequency;
        if (x.dmPelsWidth >= 1280 && visti.Add(t)) sb.Append(" " + t);
      }
      sb.Append("\n");
    }
    return sb.ToString();
  }
  public static int Imposta(string dev, int w, int h, int hz){
    var m = new DEVMODE(); m.dmSize = (short)Marshal.SizeOf(m);
    EnumDisplaySettings(dev, -1, ref m);
    m.dmPelsWidth = w; m.dmPelsHeight = h; m.dmDisplayFrequency = hz; m.dmFields = 0x80000 | 0x100000 | 0x400000;
    return ChangeDisplaySettingsEx(dev, ref m, IntPtr.Zero, 1, IntPtr.Zero);
  }
}
"@
$Error.Clear()
if (-not ('Schermi' -as [type]) -or -not ([Schermi].GetMethod('Elenco'))) { Add-Type -TypeDefinition $codice }

function Schermi-Attivi { return @(([Schermi]::Elenco()) -split "`n" | Where-Object { $_ }) }

$esito = ''
if ($Azione -eq 'imposta') {
  if (-not $Schermo) { $Schermo = (([Schermi]::Elenco()) -split "`n" | Where-Object { $_ -match '\|principale\|' } | Select-Object -First 1).Split('|')[0] }   # di serie: il principale
  $r = [Schermi]::Imposta($Schermo, $W, $H, $Hz)
  $esito = "imposta $Schermo ${W}x${H}@${Hz}: $r (0 = fatto, 1 = serve riavvio, negativo = non accettato)"
  Start-Sleep -Seconds 3
}

$sch = @(); try { $sch = @(Schermi-Attivi) } catch { $esito += ' errore: ' + $_.Exception.Message }
$vc = @(Get-CimInstance Win32_VideoController | ForEach-Object { "$($_.Name): $($_.CurrentHorizontalResolution)x$($_.CurrentVerticalResolution)@$($_.CurrentRefreshRate)" })
$st = [ordered]@{ quando = (Get-Date).ToUniversalTime().ToString('o'); pc = $env:COMPUTERNAME; azione = $Azione; esito = $esito; schermi = $sch; schede = $vc; errori = @($Error | ForEach-Object { $_.ToString() } | Select-Object -First 8) }
$json = $st | ConvertTo-Json -Depth 5
$chiave = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sY2Z2Z2hqZnp5YXpvZ2ZzamJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NTEyMjAsImV4cCI6MjA5MTQyNzIyMH0.hw1jx9Jzoi2YVdEghS4nT4BW4RKSmv6qLT93buxeoUc'
$nome = ($env:COMPUTERNAME -replace '[^A-Za-z0-9-]', '').ToLower()
Invoke-RestMethod -Method Post -Uri "https://olcfvghjfzyazogfsjbk.supabase.co/storage/v1/object/dmaster-media/finestre/banco/schermi-$nome.json" `
  -Headers @{ apikey = $chiave; Authorization = "Bearer $chiave"; 'x-upsert' = 'true' } -ContentType 'image/png' -Body ([Text.Encoding]::UTF8.GetBytes($json)) | Out-Null
$json
