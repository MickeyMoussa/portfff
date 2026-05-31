param(
  [int]$W = 700,
  [int]$H = 460,
  [int]$Budget = 6000,
  [string]$Out = "C:\Users\Gaming\Desktop\portf\_shot.png"
)
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$prof = "C:\Users\Gaming\AppData\Local\Temp\bh_chrome_prof2"
if (Test-Path $Out) { Remove-Item $Out -Force }
$p = Start-Process -FilePath $chrome -PassThru -Wait -WindowStyle Hidden -ArgumentList @(
  "--headless=old","--no-first-run","--no-default-browser-check",
  "--user-data-dir=$prof","--hide-scrollbars","--no-sandbox",
  "--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader",
  "--window-size=$W,$H","--force-device-scale-factor=1",
  "--virtual-time-budget=$Budget",
  "--screenshot=$Out","file:///C:/Users/Gaming/Desktop/portf/index.html"
)
if (Test-Path $Out) { "OK $((Get-Item $Out).Length) bytes ($W x $H)" } else { "NO SCREENSHOT (exit $($p.ExitCode))" }
