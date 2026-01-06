# GitHub Push Script with Personal Access Token
# This script will help you authenticate and push to both repositories

Write-Host "=== GitHub Authentication & Push ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Get Personal Access Token
Write-Host "Step 1: Create a GitHub Personal Access Token" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Open this link in your browser:" -ForegroundColor White
Write-Host "   https://github.com/settings/tokens/new" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. Token settings:" -ForegroundColor White
Write-Host "   - Name: Finance-Frontend-Push" -ForegroundColor Gray
Write-Host "   - Expiration: Choose your preference (90 days recommended)" -ForegroundColor Gray
Write-Host "   - Scopes: Check 'repo' (full control of private repositories)" -ForegroundColor Gray
Write-Host "3. Click 'Generate token'" -ForegroundColor White
Write-Host "4. COPY THE TOKEN (starts with ghp_)" -ForegroundColor White
Write-Host ""
Write-Host "Press Enter when you have copied your token..." -ForegroundColor Green
$null = Read-Host

Write-Host ""
Write-Host "Step 2: Enter your Personal Access Token" -ForegroundColor Yellow
Write-Host "(The token will be hidden as you type)" -ForegroundColor Gray
$secureToken = Read-Host "Paste your token here" -AsSecureString

# Convert secure string to plain text
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
$token = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host ""
    Write-Host "❌ No token provided. Exiting." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 3: Setting up authentication..." -ForegroundColor Yellow

# Get current directory
$currentDir = Get-Location

# Store original remote URLs
$originUrl = (git remote get-url origin)
$devKnUrl = (git remote get-url dev-kn)

Write-Host "Current remotes:" -ForegroundColor Gray
Write-Host "  origin: $originUrl" -ForegroundColor Gray
Write-Host "  dev-kn: $devKnUrl" -ForegroundColor Gray
Write-Host ""

# Extract repository names from URLs
if ($originUrl -match 'github\.com[:/](.+?)/(.+?)(?:\.git)?$') {
    $originRepo = $matches[1] + "/" + $matches[2]
} else {
    $originRepo = "knexpress/Finance-System-Frontend"
}

if ($devKnUrl -match 'github\.com[:/](.+?)/(.+?)(?:\.git)?$') {
    $devKnRepo = $matches[1] + "/" + $matches[2]
} else {
    $devKnRepo = "knexpress/dev-kn-system-web"
}

# Set remote URLs with token
Write-Host "Updating remote URLs with token..." -ForegroundColor Gray
git remote set-url origin "https://$token@github.com/$originRepo.git"
git remote set-url dev-kn "https://$token@github.com/$devKnRepo.git"

Write-Host ""
Write-Host "Step 4: Pushing to both repositories..." -ForegroundColor Yellow
Write-Host ""

# Push to origin
Write-Host "Pushing to origin (Finance-System-Frontend)..." -ForegroundColor Cyan
$pushOrigin = git push origin master 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Successfully pushed to origin!" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to push to origin" -ForegroundColor Red
    Write-Host $pushOrigin -ForegroundColor Yellow
}

Write-Host ""

# Push to dev-kn
Write-Host "Pushing to dev-kn (dev-kn-system-web)..." -ForegroundColor Cyan
$pushDevKn = git push dev-kn master 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Successfully pushed to dev-kn!" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to push to dev-kn" -ForegroundColor Red
    Write-Host $pushDevKn -ForegroundColor Yellow
}

# Clean up: Remove token from URLs for security
Write-Host ""
Write-Host "Cleaning up authentication (removing token from URLs)..." -ForegroundColor Gray
git remote set-url origin $originUrl
git remote set-url dev-kn $devKnUrl

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host ""
Write-Host "Repository URLs:" -ForegroundColor Cyan
Write-Host "  Origin: https://github.com/$originRepo" -ForegroundColor White
Write-Host "  Dev-KN: https://github.com/$devKnRepo" -ForegroundColor White


