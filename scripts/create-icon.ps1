$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$demoIconRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$demoIconSource = New-Object System.Drawing.Bitmap 256,256
$demoIconGraphics = [System.Drawing.Graphics]::FromImage($demoIconSource)
$demoIconGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$demoIconGraphics.Clear([System.Drawing.Color]::Transparent)
$demoIconShape = New-Object System.Drawing.Drawing2D.GraphicsPath
$demoIconShape.AddArc(12,12,84,84,180,90)
$demoIconShape.AddArc(160,12,84,84,270,90)
$demoIconShape.AddArc(160,160,84,84,0,90)
$demoIconShape.AddArc(12,160,84,84,90,90)
$demoIconShape.CloseFigure()
$demoIconBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#426F54'))
$demoIconGraphics.FillPath($demoIconBrush,$demoIconShape)
$demoIconPen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#F3F7EE')),10
$demoIconPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$demoIconPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$demoIconPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$demoIconGraphics.DrawLines($demoIconPen,[System.Drawing.PointF[]]@([System.Drawing.PointF]::new(51,80),[System.Drawing.PointF]::new(66,95),[System.Drawing.PointF]::new(91,65)))
$demoIconGraphics.DrawLine($demoIconPen,113,80,197,80)
$demoIconGraphics.DrawLine($demoIconPen,113,132,197,132)
$demoIconGraphics.DrawLine($demoIconPen,113,184,170,184)
$demoIconPen.Width = 6
$demoIconGraphics.DrawEllipse($demoIconPen,60,123,18,18)
$demoIconGraphics.DrawEllipse($demoIconPen,60,175,18,18)
$demoIconSource.Save((Join-Path $demoIconRoot 'assets\app-icon.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$demoIconSizes = @(16,24,32,48,64,128,256)
$demoIconImages = @()
foreach ($demoIconSize in $demoIconSizes) {
  $demoIconBitmap = New-Object System.Drawing.Bitmap $demoIconSize,$demoIconSize
  $demoIconCanvas = [System.Drawing.Graphics]::FromImage($demoIconBitmap)
  $demoIconCanvas.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $demoIconCanvas.DrawImage($demoIconSource,0,0,$demoIconSize,$demoIconSize)
  $demoIconStream = New-Object System.IO.MemoryStream
  $demoIconBitmap.Save($demoIconStream,[System.Drawing.Imaging.ImageFormat]::Png)
  $demoIconImages += ,$demoIconStream.ToArray()
  $demoIconStream.Dispose()
  $demoIconCanvas.Dispose()
  $demoIconBitmap.Dispose()
}
$demoIconFile = [System.IO.File]::Create((Join-Path $demoIconRoot 'assets\app-icon.ico'))
$demoIconWriter = New-Object System.IO.BinaryWriter $demoIconFile
$demoIconWriter.Write([uint16]0)
$demoIconWriter.Write([uint16]1)
$demoIconWriter.Write([uint16]$demoIconSizes.Count)
$demoIconOffset = 6 + 16 * $demoIconSizes.Count
for ($demoIconIndex = 0; $demoIconIndex -lt $demoIconSizes.Count; $demoIconIndex++) {
  $demoIconDimension = if ($demoIconSizes[$demoIconIndex] -eq 256) { 0 } else { $demoIconSizes[$demoIconIndex] }
  $demoIconWriter.Write([byte]$demoIconDimension)
  $demoIconWriter.Write([byte]$demoIconDimension)
  $demoIconWriter.Write([byte]0)
  $demoIconWriter.Write([byte]0)
  $demoIconWriter.Write([uint16]1)
  $demoIconWriter.Write([uint16]32)
  $demoIconWriter.Write([uint32]$demoIconImages[$demoIconIndex].Length)
  $demoIconWriter.Write([uint32]$demoIconOffset)
  $demoIconOffset += $demoIconImages[$demoIconIndex].Length
}
foreach ($demoIconImage in $demoIconImages) { $demoIconWriter.Write([byte[]]$demoIconImage) }
$demoIconWriter.Dispose()
$demoIconFile.Dispose()
$demoIconPen.Dispose()
$demoIconBrush.Dispose()
$demoIconShape.Dispose()
$demoIconGraphics.Dispose()
$demoIconSource.Dispose()
