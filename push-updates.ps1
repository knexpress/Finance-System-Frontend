# Push to both GitHub repositories
# This script will prompt for a GitHub Personal Access Token and push to both repos

param(
    [string]$Token = ""
)

Write-Host "=== Push to GitHub Repositories ===" -ForegroundColor Cyan
Write-Host ""

if ([string]::IsNullOrWhiteSpace($Token)) {
    Write-Host "To push to GitHub, you need a Personal Access Token." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. Create a token at: https://github.com/settings/tokens/new" -ForegroundColor White
    Write-Host "   - Name: Finance-Push-Token" -ForegroundColor Gray
    Write-Host "   - Expiration: Your choice" -ForegroundColor Gray
    Write-Host "   - Scopes: Check 'repo' (full control)" -ForegroundColor Gray
    Write-Host "2. Click 'Generate token' and copy it" -ForegroundColor White
    Write-Host ""
    $Token = Read-Host "Enter your Personal Access Token" -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($Token)
    $Token = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
}

if ([string]::IsNullOrWhiteSpace($Token)) {
    Write-Host "❌ No token provided. Exiting." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Pushing to repositories..." -ForegroundColor Yellow
Write-Host ""

# Store original remote URLs
$originUrl = (git remote get-url origin)
$devKnUrl = (git remote get-url dev-kn)

# Update remotes with token
Write-Host "Updating remote URLs..." -ForegroundColor Gray
git remote set-url origin "https://$Token@github.com/knexpress/Finance-System-Frontend.git"
git remote set-url dev-kn "https://$Token@github.com/knexpress/dev-kn-system-web.git"

# Push to origin
Write-Host ""
Write-Host "Pushing to origin (Finance-System-Frontend)..." -ForegroundColor Cyan
$pushOrigin = git push origin master 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Successfully pushed to Finance-System-Frontend!" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to push to Finance-System-Frontend" -ForegroundColor Red
    Write-Host $pushOrigin -ForegroundColor Yellow
}

# Push to dev-kn
Write-Host ""
Write-Host "Pushing to dev-kn (dev-kn-system-web)..." -ForegroundColor Cyan
$pushDevKn = git push dev-kn master 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Successfully pushed to dev-kn-system-web!" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to push to dev-kn-system-web" -ForegroundColor Red
    Write-Host $pushDevKn -ForegroundColor Yellow
}

# Restore original URLs (remove token)
Write-Host ""
Write-Host "Cleaning up (removing token from URLs)..." -ForegroundColor Gray
git remote set-url origin $originUrl
git remote set-url dev-kn $devKnUrl

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green

