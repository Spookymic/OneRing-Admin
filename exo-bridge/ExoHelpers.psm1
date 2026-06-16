<#
  Fonctions partagees du pont Exchange Online.
  Importe dans tous les runspaces Pode via Import-PodeModule (voir server.ps1).
#>

# Connexion app-only paresseuse : ouvre une session EXO si le runspace courant n'en a pas.
# Le module met les jetons en cache, donc les appels suivants sont rapides.
function Connect-ExoIfNeeded {
    $conn = Get-ConnectionInformation -ErrorAction SilentlyContinue
    if ($conn | Where-Object { $_.State -eq 'Connected' }) { return }

    $securePwd = ConvertTo-SecureString -String $env:EXO_CERT_PASSWORD -AsPlainText -Force
    Connect-ExchangeOnline `
        -AppId $env:EXO_APP_ID `
        -Organization $env:EXO_ORG `
        -CertificateFilePath $env:EXO_CERT_PATH `
        -CertificatePassword $securePwd `
        -ShowBanner:$false -ErrorAction Stop | Out-Null
}

Export-ModuleMember -Function Connect-ExoIfNeeded
