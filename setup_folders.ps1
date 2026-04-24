$base = "c:\programs\nm_traffic_flow_optimization"

$folders = @(
    "data\raw\india_vehicles",
    "data\raw\pems",
    "data\raw\accidents",
    "data\labeled",
    "data\processed",
    "models\yolo",
    "models\lstm",
    "models\rl\checkpoints",
    "models\accident",
    "signal_graph",
    "mqtt",
    "dashboard",
    "sumo_sim",
    "logs\rl_tensorboard"
)

foreach ($folder in $folders) {
    $path = Join-Path $base $folder
    New-Item -ItemType Directory -Path $path -Force | Out-Null
    Write-Host "Created: $path"
}

Write-Host ""
Write-Host "Folder structure created successfully."
Get-ChildItem $base -Directory | ForEach-Object { Write-Host "  $($_.Name)/" }
