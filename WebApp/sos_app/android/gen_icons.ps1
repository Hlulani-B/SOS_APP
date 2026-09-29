# One-shot icon/splash generator for the Capacitor app. Not part of the build;
# run manually after replacing the source artwork. Uses System.Drawing
# (PowerShell 5.1 compatible) to stamp the weather icon into every density
# bucket the Android res folder carries.
Add-Type -AssemblyName System.Drawing

$src = "C:\Users\baloy_at1tft9\.qoder\vibe_images\weather_app_icon_1790657201.png"
$res = Join-Path $PSScriptRoot "app\src\main\res"

function New-Canvas([int]$w, [int]$h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  return @{ bmp = $bmp; g = $g }
}

function Save-Png($bmp, [string]$path) {
  $tmp = "$path.tmp.png"
  $bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
  Move-Item $tmp $path -Force
  "wrote $((Split-Path $path -Leaf)) @ $((Split-Path (Split-Path $path -Parent) -Leaf)): $((Get-Item $path).Length) bytes"
}

$source = [System.Drawing.Image]::FromFile($src)

# launcher squares + round masks: 48..192 by density
$launcher = @{ "mdpi" = 48; "hdpi" = 72; "xhdpi" = 96; "xxhdpi" = 144; "xxxhdpi" = 192 }
foreach ($dpi in $launcher.Keys) {
  $px = $launcher[$dpi]

  $c = New-Canvas $px $px
  $c.g.DrawImage($source, 0, 0, $px, $px)
  Save-Png $c.bmp (Join-Path $res "mipmap-$dpi\ic_launcher.png")
  $c.g.Dispose(); $c.bmp.Dispose()

  $r = New-Canvas $px $px
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse(0, 0, $px, $px)
  $r.g.SetClip($path)
  $r.g.DrawImage($source, 0, 0, $px, $px)
  Save-Png $r.bmp (Join-Path $res "mipmap-$dpi\ic_launcher_round.png")
  $r.g.Dispose(); $r.bmp.Dispose()

  # adaptive foreground: full-bleed on the 108dp canvas (launcher masks it)
  $fx = [int](108 * $px / 48)
  $f = New-Canvas $fx $fx
  $f.g.DrawImage($source, 0, 0, $fx, $fx)
  Save-Png $f.bmp (Join-Path $res "mipmap-$dpi\ic_launcher_foreground.png")
  $f.g.Dispose(); $f.bmp.Dispose()
}

# splash screens: cover-crop the square art into each landscape/portrait frame
$splashSizes = @{
  "drawable\splash.png"                       = @(480, 320)
  "drawable-land-mdpi\splash.png"             = @(480, 320)
  "drawable-land-hdpi\splash.png"             = @(800, 480)
  "drawable-land-xhdpi\splash.png"            = @(1280, 720)
  "drawable-land-xxhdpi\splash.png"           = @(1600, 960)
  "drawable-land-xxxhdpi\splash.png"          = @(1920, 1280)
  "drawable-port-mdpi\splash.png"             = @(320, 480)
  "drawable-port-hdpi\splash.png"             = @(480, 800)
  "drawable-port-xhdpi\splash.png"            = @(720, 1280)
  "drawable-port-xxhdpi\splash.png"           = @(960, 1600)
  "drawable-port-xxxhdpi\splash.png"          = @(1280, 1920)
}
foreach ($rel in $splashSizes.Keys) {
  $w, $h = $splashSizes[$rel]
  $s = New-Canvas $w $h
  $ratio = [Math]::Max($w / $source.Width, $h / $source.Height)
  $dw = [int]($source.Width * $ratio)
  $dh = [int]($source.Height * $ratio)
  $s.g.DrawImage($source, [int](($w - $dw) / 2), [int](($h - $dh) / 2), $dw, $dh)
  Save-Png $s.bmp (Join-Path $res $rel)
  $s.g.Dispose(); $s.bmp.Dispose()
}

$source.Dispose()
"done"
