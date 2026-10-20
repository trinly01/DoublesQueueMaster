# Generates scratch (TTS) voiceover WAVs into remotion/public/vo/.
# These are TIMING PLACEHOLDERS — replace with a human read (see README).
# Usage: powershell -NoProfile -File scripts/gen-vo.ps1

Add-Type -AssemblyName System.Speech

$out = Join-Path $PSScriptRoot "..\public\vo"
New-Item -ItemType Directory -Force -Path $out | Out-Null

$scripts = @{
  "ad1-walking-paddle" = "Still doing the walking paddle shuffle at open play? DinkMatch drafts fair, balanced matches automatically. Five modes, zero politics. Try it free, no sign up."
  "ad2-zero-politics"  = "Running open play shouldn't feel like refereeing. Lock a spot, link a duo, quietly avoid a clash. DinkMatch handles the politics so you can just play."
  "ad3-every-game"     = "What if every open-play game counted? Real ratings, best-duo leaderboards, DUPR sync. Track your rise with DinkMatch. Start free."
}

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = $synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }
Write-Host "Installed voices: $($voices -join ', ')"

foreach ($key in $scripts.Keys) {
  $file = Join-Path $out "$key.wav"
  $synth.SetOutputToWaveFile($file)
  $synth.Speak($scripts[$key])
  $synth.SetOutputToNull()
  Write-Host "wrote vo/$key.wav"
}
$synth.Dispose()
