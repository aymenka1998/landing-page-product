$ErrorActionPreference = 'Stop'
$dashboard = Split-Path -Parent $MyInvocation.MyCommand.Path
$store = 'Cert:\CurrentUser\My'
$rootName = "Product Dashboard Local CA $env:COMPUTERNAME"
$leafName = "$env:COMPUTERNAME.local"
Get-ChildItem $store | Where-Object { $_.Subject -eq "CN=$rootName" -or $_.Subject -eq "CN=$leafName" } | Remove-Item -Force
Get-ChildItem 'Cert:\CurrentUser\Root' | Where-Object { $_.Subject -eq "CN=$rootName" } | Remove-Item -Force
$ca = New-SelfSignedCertificate -Subject "CN=$rootName" -CertStoreLocation $store -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyUsage CertSign, CRLSign, DigitalSignature -NotAfter (Get-Date).AddYears(5) -TextExtension @('2.5.29.19={critical}{text}ca=1')
$names = @('localhost', $env:COMPUTERNAME, $leafName)
$serverCert = New-SelfSignedCertificate -Subject "CN=$leafName" -DnsName $names -Signer $ca -CertStoreLocation $store -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyUsage DigitalSignature, KeyEncipherment -Type SSLServerAuthentication -NotAfter (Get-Date).AddYears(2)
$secret = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
$password = ConvertTo-SecureString -String $secret -AsPlainText -Force
Export-PfxCertificate -Cert $serverCert -FilePath (Join-Path $dashboard '.dashboard-server.pfx') -Password $password | Out-Null
$config = @{ passphrase = $secret; host = $leafName } | ConvertTo-Json
[System.IO.File]::WriteAllText((Join-Path $dashboard '.dashboard-https.json'), $config, [System.Text.UTF8Encoding]::new($false))
$publicFolder = Join-Path $dashboard 'public'
Export-Certificate -Cert $ca -FilePath (Join-Path $publicFolder 'local-dashboard-root.cer') -Force | Out-Null
Import-Certificate -FilePath (Join-Path $publicFolder 'local-dashboard-root.cer') -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null
Write-Host "HTTPS is ready. On the phone, open https://$leafName`:4000 after installing local-dashboard-root.cer."
Write-Host "Copy local-dashboard-root.cer to the phone and install it as a trusted CA certificate."
