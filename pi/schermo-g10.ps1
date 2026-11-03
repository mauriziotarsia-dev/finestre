# schermo-g10.ps1 — 3/11/2026: il G10 manda al TV 1920x1080 a 60 Hz (deciso il Full HD; a 4K usciva a 30 Hz)
# e non va mai in sospensione. Si lancia anche da lontano:  irm https://raw.githubusercontent.com/mauriziotarsia-dev/finestre/main/pi/schermo-g10.ps1 | iex
$cs = @"
using System; using System.Runtime.InteropServices;
public class SchermoG10 {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public struct DM {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string nome;
    public short sv, dv, size, extra; public int campi;
    public int x, y, orient, fisso;
    public short colore, duplex, yres, tt, collate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string modulo;
    public short logpix; public int bpp, larg, alt, flag, freq, icm1, icm2, media, dither, r1, r2, pw, ph;
  }
  [DllImport("user32.dll")] public static extern int EnumDisplaySettings(string dev, int modo, ref DM dm);
  [DllImport("user32.dll")] public static extern int ChangeDisplaySettings(ref DM dm, int flag);
}
"@
Add-Type -TypeDefinition $cs
$dm = New-Object SchermoG10+DM
$dm.size = [Runtime.InteropServices.Marshal]::SizeOf($dm)
[SchermoG10]::EnumDisplaySettings($null, -1, [ref]$dm) | Out-Null
Write-Host ("Prima: {0}x{1} a {2} Hz" -f $dm.larg, $dm.alt, $dm.freq)
$dm.larg = 1920; $dm.alt = 1080; $dm.freq = 60; $dm.campi = 0x580000
$r = [SchermoG10]::ChangeDisplaySettings([ref]$dm, 1)
Write-Host ("Cambio risoluzione: {0} (0 = fatto)" -f $r)
[SchermoG10]::EnumDisplaySettings($null, -1, [ref]$dm) | Out-Null
Write-Host ("Adesso: {0}x{1} a {2} Hz" -f $dm.larg, $dm.alt, $dm.freq)
# mai in sospensione, schermo sempre acceso (attaccato alla corrente)
foreach ($c in 'standby-timeout-ac','monitor-timeout-ac','hibernate-timeout-ac') { powercfg /change $c 0 2>$null }
Write-Host "Sospensione: mai"
