param(
    [string]$Repository = "mufenxu/MY",
    [string]$OutputDirectory = (Join-Path $env:USERPROFILE ".android")
)

$ErrorActionPreference = "Stop"
$keystorePath = Join-Path $OutputDirectory "my-control-release.jks"
$credentialsPath = Join-Path $OutputDirectory "my-control-release.credentials.dpapi"
$keyAlias = "my-control-release"

function New-RandomPassword {
    $bytes = [byte[]]::new(32)
    [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Protect-Credentials([object]$credentials) {
    $plainText = $credentials | ConvertTo-Json -Compress
    $secureText = ConvertTo-SecureString $plainText -AsPlainText -Force
    return ConvertFrom-SecureString $secureText
}

function Unprotect-Credentials([string]$encrypted) {
    $secureText = ConvertTo-SecureString $encrypted
    $plainText = [Net.NetworkCredential]::new("", $secureText).Password
    return $plainText | ConvertFrom-Json
}

function Set-GitHubSecret([string]$name, [string]$value) {
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = "gh.exe"
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.ArgumentList.Add("secret")
    $startInfo.ArgumentList.Add("set")
    $startInfo.ArgumentList.Add($name)
    $startInfo.ArgumentList.Add("--repo")
    $startInfo.ArgumentList.Add($Repository)
    $process = [Diagnostics.Process]::Start($startInfo)
    $process.StandardInput.Write($value)
    $process.StandardInput.Close()
    $errorOutput = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) {
        throw "Failed to configure GitHub secret ${name}: $errorOutput"
    }
}

if ((Test-Path -LiteralPath $keystorePath) -xor (Test-Path -LiteralPath $credentialsPath)) {
    throw "Release keystore and encrypted credentials must either both exist or both be absent."
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

if (Test-Path -LiteralPath $keystorePath) {
    $credentials = Unprotect-Credentials (Get-Content -Raw -LiteralPath $credentialsPath)
} else {
    $password = New-RandomPassword
    $credentials = [pscustomobject]@{
        keyAlias = $keyAlias
        storePassword = $password
        keyPassword = $password
    }
    $keytoolPath = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME "bin\keytool.exe" } else { "" }
    if (!$keytoolPath -or !(Test-Path -LiteralPath $keytoolPath)) {
        $keytoolPath = (Get-Command keytool.exe -ErrorAction Stop).Source
    }
    $keytoolArguments = @(
        "-genkeypair",
        "-keystore", $keystorePath,
        "-storetype", "PKCS12",
        "-storepass", $credentials.storePassword,
        "-alias", $credentials.keyAlias,
        "-keypass", $credentials.keyPassword,
        "-keyalg", "RSA",
        "-keysize", "4096",
        "-sigalg", "SHA256withRSA",
        "-validity", "10000",
        "-dname", "CN=MY Control, OU=Android Release, O=MY, C=CN",
        "-noprompt"
    )
    & $keytoolPath @keytoolArguments
    if ($LASTEXITCODE -ne 0) { throw "keytool failed to create the Android release keystore." }
    [IO.File]::WriteAllText($credentialsPath, (Protect-Credentials $credentials))
    & icacls.exe $keystorePath /inheritance:r /grant:r "${env:USERNAME}:(F)" | Out-Null
    & icacls.exe $credentialsPath /inheritance:r /grant:r "${env:USERNAME}:(F)" | Out-Null
}

$keystoreBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($keystorePath))
Set-GitHubSecret "ANDROID_RELEASE_KEYSTORE_BASE64" $keystoreBase64
Set-GitHubSecret "ANDROID_RELEASE_KEY_ALIAS" $credentials.keyAlias
Set-GitHubSecret "ANDROID_RELEASE_STORE_PASSWORD" $credentials.storePassword
Set-GitHubSecret "ANDROID_RELEASE_KEY_PASSWORD" $credentials.keyPassword

Write-Output "Dedicated Android release signing is configured for $Repository."
Write-Output "Keystore: $keystorePath"
Write-Output "Encrypted recovery credentials: $credentialsPath"
