# Изменение размера SVG иконок с 48px на 256px

$iconsPath = ".\assets\icons"
$svgFiles = Get-ChildItem -Path $iconsPath -Filter "*.svg"

foreach ($file in $svgFiles) {
    Write-Host "Processing: $($file.Name)"
    
    $content = Get-Content $file.FullName -Raw
    
    # Меняем height и width с 48px на 256px
    $content = $content -replace 'height="48px"', 'height="256px"'
    $content = $content -replace 'width="48px"', 'width="256px"'
    
    # Сохраняем обратно
    Set-Content -Path $file.FullName -Value $content -NoNewline
    
    Write-Host "  Resized to 256x256" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done! All SVG icons now 256x256" -ForegroundColor Cyan
