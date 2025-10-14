param([string]$ComposePath = ".")

# Display functions
function Write-Status { param([string]$Message); Write-Host "[INFO] $Message" -ForegroundColor Green }
function Write-Warning { param([string]$Message); Write-Host "[WARNING] $Message" -ForegroundColor Yellow }  
function Write-Error { param([string]$Message); Write-Host "[ERROR] $Message" -ForegroundColor Red }

# Check Ollama installation
function Test-Ollama {
    Write-Status "Checking Ollama installation..."
    try {
        $null = Get-Command ollama -ErrorAction Stop
        Write-Status "Ollama found"
        return $true
    }
    catch {
        Write-Error "Ollama not found"
        Write-Status "Install from: https://ollama.com/download/windows"
        return $false
    }
}

# Download model
function Get-Model {
    param([string]$ModelName)
    Write-Status "Downloading: $ModelName"
    try {
        $result = & ollama pull $ModelName 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Status "Model $ModelName OK"
            return $true
        }
        else {
            Write-Error "Failed to download model $ModelName"
            return $false
        }
    }
    catch {
        Write-Error "Error downloading model $ModelName"
        return $false
    }
}

# Check Docker installation
function Test-Docker {
    Write-Status "Checking Docker..."
    try {
        $null = Get-Command docker -ErrorAction Stop
        & docker version | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Docker not running"
            return $false
        }
    }
    catch {
        Write-Error "Docker not found"
        return $false
    }
    
    try {
        & docker compose version | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $script:ComposeCmd = "docker compose"
            Write-Status "Docker Compose OK"
            return $true
        }
    }
    catch { }
    
    try {
        $null = Get-Command docker-compose -ErrorAction Stop
        $script:ComposeCmd = "docker-compose"
        Write-Status "docker-compose OK"
        return $true
    }
    catch {
        Write-Error "Docker Compose not found"
        return $false
    }
}

# Main script
Write-Status "Starting car-claim setup script..."

# Initial checks
if (-not (Test-Ollama)) { exit 1 }
if (-not (Test-Docker)) { exit 1 }

# Start Ollama if needed
$ollamaProcess = Get-Process -Name "ollama*" -ErrorAction SilentlyContinue
if (-not $ollamaProcess) {
    Write-Status "Starting Ollama..."
    try {
        Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
        Start-Sleep 3
    }
    catch {
        Write-Warning "Manual start required: ollama serve"
    }
}

# Download required models
$models = @("qwen2.5vl:7b", "mxbai-embed-large")
foreach ($model in $models) {
    $modelList = & ollama list 2>$null
    if ($modelList -like "*$model*") {
        Write-Status "Model $model already present"
    }
    else {
        if (-not (Get-Model $model)) {
            Write-Error "Failed to download $model"
            exit 1
        }
    }
}

# Find docker-compose.yml
$composePath = Resolve-Path $ComposePath
$composeFile = Join-Path $composePath "docker-compose.yml"

if (-not (Test-Path $composeFile)) {
    Write-Warning "docker-compose.yml not found in: $composePath"
    $parent = Split-Path $composePath -Parent
    while ($parent -and $parent -ne (Split-Path $parent -Parent)) {
        $testFile = Join-Path $parent "docker-compose.yml"
        if (Test-Path $testFile) {
            Set-Location $parent
            Write-Status "docker-compose.yml found in: $parent"
            break
        }
        $parent = Split-Path $parent -Parent
    }
    if (-not (Test-Path (Join-Path (Get-Location) "docker-compose.yml"))) {
        Write-Error "docker-compose.yml not found anywhere"
        exit 1
    }
}
else {
    Set-Location $composePath
    Write-Status "Using docker-compose.yml in: $composePath"
}

# Final verification before launch
Write-Status "Checking services in docker-compose.yml..."
$composeContent = Get-Content "docker-compose.yml" -Raw
$requiredServices = @("car-claim-server", "car-claim-client", "mongodb")
foreach ($service in $requiredServices) {
    if ($composeContent -notmatch $service) {
        Write-Warning "Service '$service' not found in docker-compose.yml"
    }
    else {
        Write-Status "Service '$service' found"
    }
}

# Launch Docker Compose with detailed error capture
Write-Status "Launching Docker Compose..."
Write-Status "Directory: $(Get-Location)"
Write-Status "Command: $ComposeCmd up car-claim-server car-claim-client mongodb --build"

try {
    # Capture stdout and stderr separately
    $pinfo = New-Object System.Diagnostics.ProcessStartInfo
    $pinfo.FileName = ($ComposeCmd -split ' ')[0]
    $pinfo.Arguments = (($ComposeCmd -split ' ')[1..99] + @("up", "car-claim-server", "car-claim-client", "mongodb", "--build")) -join ' '
    $pinfo.UseShellExecute = $false
    $pinfo.RedirectStandardOutput = $true
    $pinfo.RedirectStandardError = $true
    $pinfo.CreateNoWindow = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $pinfo
    $process.Start() | Out-Null
    
    # Read stdout and stderr in real-time
    while (-not $process.HasExited) {
        if (-not $process.StandardOutput.EndOfStream) {
            $line = $process.StandardOutput.ReadLine()
            if ($line) { Write-Host $line }
        }
        if (-not $process.StandardError.EndOfStream) {
            $errorLine = $process.StandardError.ReadLine()
            if ($errorLine) { Write-Host $errorLine -ForegroundColor Yellow }
        }
        Start-Sleep -Milliseconds 100
    }
    
    # Read remaining messages
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    
    if ($stdout) { Write-Host $stdout }
    if ($stderr) { Write-Host $stderr -ForegroundColor Yellow }
    
    $process.WaitForExit()
    $exitCode = $process.ExitCode
    
    if ($exitCode -eq 0) {
        Write-Status "Docker Compose launched successfully"
    } else {
        Write-Error "Docker Compose failed with code: $exitCode"
        if ($stderr) {
            Write-Error "Detailed errors:"
            Write-Host $stderr -ForegroundColor Red
        }
        exit $exitCode
    }
}
catch {
    Write-Error "Error launching Docker Compose:"
    Write-Error $_.Exception.Message
    if ($_.Exception.InnerException) {
        Write-Error "Inner error: $($_.Exception.InnerException.Message)"
    }
    exit 1
}

Write-Status "Script completed successfully"
