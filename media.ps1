param([string]$Cmd = '', [double]$Arg = 0)
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $t) { $m = $asTask.MakeGenericMethod($t); $n = $m.Invoke($null, @($op)); $n.Wait(-1) | Out-Null; $n.Result }
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

if ($Cmd) {
  $s = $mgr.GetCurrentSession()
  if ($s) {
    switch ($Cmd) {
      'toggle' { [void](Await ($s.TryTogglePlayPauseAsync()) ([bool])) }
      'next'   { [void](Await ($s.TrySkipNextAsync()) ([bool])) }
      'prev'   { [void](Await ($s.TrySkipPreviousAsync()) ([bool])) }
      'seek'   { [void](Await ($s.TryChangePlaybackPositionAsync([long]($Arg * 10000000))) ([bool])) }
    }
  }
  exit
}

while ($true) {
  $s = $mgr.GetCurrentSession()
  if ($s) {
    $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $i = $s.GetPlaybackInfo(); $t = $s.GetTimelineProperties()
    $o = @{ title = $p.Title; artist = $p.Artist; playing = ([int]$i.PlaybackStatus -eq 4);
            pos = [math]::Round($t.Position.TotalSeconds, 1);
            dur = [math]::Round($t.EndTime.TotalSeconds - $t.StartTime.TotalSeconds, 1);
            app = $s.SourceAppUserModelId }
  } else {
    $o = @{ title = ''; artist = ''; playing = $false; pos = 0; dur = 0; app = '' }
  }
  [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); [Console]::Out.Flush()
  Start-Sleep -Milliseconds 1000
}
