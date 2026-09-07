<#
  rotate-production-secrets.ps1

  Purpose (Customer #1 — Section D secret-exposure recovery, D5-R1):
  Regenerate the 5 production secrets below with cryptographically secure random
  alphanumeric-only values, and write them DIRECTLY into the two target .env files.

    Root  .env         -> POSTGRES_PASSWORD
    backend\.env        -> JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, SIGNUP_SECRET,
                           FORGOT_PASSWORD_OTP_SECRET

  MUST be run directly by a human operator in their own PowerShell terminal,
  OUTSIDE Claude Code / any AI tool session — the whole point of this script is that
  the generated values never appear in any tool output, transcript, clipboard, or
  secondary file.

  This script prints ONLY non-sensitive status lines (VARNAME: ROTATED, and a final
  ROTATION COMPLETE). It never prints, logs, or copies an actual secret value.

  Usage:
    powershell -NoProfile -ExecutionPolicy Bypass -File "C:\pos-erp\tools\rotate-production-secrets.ps1"
#>

[CmdletBinding()]
param(
    [string]$RootEnvPath = 'C:\pos-erp\.env',
    [string]$BackendEnvPath = 'C:\pos-erp\backend\.env'
)

$ErrorActionPreference = 'Stop'

function New-SecureAlphanumeric {
    <#
      Cryptographically secure, unbiased alphanumeric string generator.
      Uses RandomNumberGenerator (RNGCryptoServiceProvider under .NET Framework /
      Windows PowerShell 5.1) with rejection sampling to avoid modulo bias.
    #>
    param([Parameter(Mandatory)][int]$Length)

    $chars = @()
    $chars += 48..57   # 0-9
    $chars += 65..90   # A-Z
    $chars += 97..122  # a-z
    $charCount = $chars.Length  # 62
    $maxValid = 256 - (256 % $charCount)  # reject bytes >= this to keep distribution uniform

    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $resultChars = New-Object System.Collections.Generic.List[char]
        $buffer = New-Object byte[] 1
        while ($resultChars.Count -lt $Length) {
            $rng.GetBytes($buffer)
            $b = [int]$buffer[0]
            if ($b -lt $maxValid) {
                $idx = $b % $charCount
                $resultChars.Add([char]$chars[$idx])
            }
        }
        return -join $resultChars
    }
    finally {
        $rng.Dispose()
    }
}

function Set-EnvVarValue {
    <#
      Replaces the value of KEY=... on its own line inside $Content, exactly once.
      Uses [^\r\n]* (not .*) so CRLF line endings are preserved untouched.
      Throws if the key is not found exactly once — never guesses, never writes
      more than one occurrence, never silently no-ops.
    #>
    param(
        [Parameter(Mandatory)][string]$Content,
        [Parameter(Mandatory)][string]$Key,
        [Parameter(Mandatory)][string]$NewValue
    )

    $pattern = "(?m)^$Key=[^\r\n]*"
    $matches = [regex]::Matches($Content, $pattern)
    if ($matches.Count -ne 1) {
        throw "Expected exactly 1 occurrence of '$Key=' in target file, found $($matches.Count). Aborting — no files were modified."
    }

    # Replacement value is alphanumeric-only, so no regex replacement-escaping is needed.
    return [regex]::Replace($Content, $pattern, "$Key=$NewValue", 1)
}

# --- D5-R1.10: fail safely if either target file is missing, before touching anything ---
if (-not (Test-Path -LiteralPath $RootEnvPath)) {
    Write-Error "Root .env not found at: $RootEnvPath -- aborting, nothing was modified."
    exit 1
}
if (-not (Test-Path -LiteralPath $BackendEnvPath)) {
    Write-Error "backend\.env not found at: $BackendEnvPath -- aborting, nothing was modified."
    exit 1
}

$rootContent = [System.IO.File]::ReadAllText($RootEnvPath)
$backendContent = [System.IO.File]::ReadAllText($BackendEnvPath)

# --- Pre-flight: verify every target key exists exactly once BEFORE generating/writing anything ---
try {
    [void][regex]::Matches($rootContent, '(?m)^POSTGRES_PASSWORD=[^\r\n]*')
    $rootContent = Set-EnvVarValue -Content $rootContent -Key 'POSTGRES_PASSWORD' -NewValue (New-SecureAlphanumeric -Length 48)

    $jwtAccess = New-SecureAlphanumeric -Length 48
    $jwtRefresh = New-SecureAlphanumeric -Length 48
    while ($jwtRefresh -eq $jwtAccess) {
        $jwtRefresh = New-SecureAlphanumeric -Length 48
    }

    $backendContent = Set-EnvVarValue -Content $backendContent -Key 'JWT_ACCESS_SECRET' -NewValue $jwtAccess
    $backendContent = Set-EnvVarValue -Content $backendContent -Key 'JWT_REFRESH_SECRET' -NewValue $jwtRefresh
    $backendContent = Set-EnvVarValue -Content $backendContent -Key 'SIGNUP_SECRET' -NewValue (New-SecureAlphanumeric -Length 48)
    $backendContent = Set-EnvVarValue -Content $backendContent -Key 'FORGOT_PASSWORD_OTP_SECRET' -NewValue (New-SecureAlphanumeric -Length 48)
}
catch {
    Write-Error "Pre-flight validation failed: $($_.Exception.Message)"
    exit 1
}

# --- Write both files only after all replacements succeeded in memory ---
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($BackendEnvPath, $backendContent, $utf8NoBom)
[System.IO.File]::WriteAllText($RootEnvPath, $rootContent, $utf8NoBom)

# --- Post-write integrity check: confirm each key still occurs exactly once (no value printed) ---
$verifyRoot = [System.IO.File]::ReadAllText($RootEnvPath)
$verifyBackend = [System.IO.File]::ReadAllText($BackendEnvPath)

$checks = @(
    @{ Name = 'POSTGRES_PASSWORD'; Content = $verifyRoot },
    @{ Name = 'JWT_ACCESS_SECRET'; Content = $verifyBackend },
    @{ Name = 'JWT_REFRESH_SECRET'; Content = $verifyBackend },
    @{ Name = 'SIGNUP_SECRET'; Content = $verifyBackend },
    @{ Name = 'FORGOT_PASSWORD_OTP_SECRET'; Content = $verifyBackend }
)

foreach ($check in $checks) {
    $count = [regex]::Matches($check.Content, "(?m)^$($check.Name)=[^\r\n]*").Count
    if ($count -ne 1) {
        Write-Error "$($check.Name): post-write verification failed (found $count occurrences)."
        exit 1
    }
    Write-Output "$($check.Name): ROTATED"
}

# Best-effort clear of in-memory secret variables (does not guarantee scrubbing from process
# memory/GC, but avoids leaving them bound in the session any longer than necessary).
Remove-Variable jwtAccess, jwtRefresh, rootContent, backendContent, verifyRoot, verifyBackend -ErrorAction SilentlyContinue

Write-Output "ROTATION COMPLETE"
