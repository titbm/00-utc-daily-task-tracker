# Скрипт для оптимизации SVG иконок - удаление отступов
# Устанавливает viewBox точно по размеру контента

$iconsPath = ".\assets\icons"
$svgFiles = Get-ChildItem -Path $iconsPath -Filter "*.svg"

foreach ($file in $svgFiles) {
    Write-Host "Processing: $($file.Name)"
    
    $content = Get-Content $file.FullName -Raw
    
    # Для Material Symbols viewBox "0 -960 960 960" - сдвиг по Y
    # Меняем на "0 0 960 960" чтобы убрать отступы
    $content = $content -replace 'viewBox="0 -960 960 960"', 'viewBox="0 0 960 960"'
    
    # Сохраняем обратно
    Set-Content -Path $file.FullName -Value $content -NoNewline
    
    Write-Host "  Optimized" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done! All SVG icons optimized." -ForegroundColor Cyan
