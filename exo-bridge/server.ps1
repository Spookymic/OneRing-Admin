<#
  OneRing — Exchange Online bridge (sidecar)

  API REST interne consommee UNIQUEMENT par l'app Next.js (reseau Docker interne).
  Auth EXO : app-only par certificat. Voir docs/ADR-001-pont-exchange.md

  Etape 1 (socle) : /health + /diag/dl pour valider la chaine de bout en bout.
  Les endpoints de mutation (membres DL, boites partagees) arrivent en etape 2.
#>

# --- Verification des variables d'environnement requises au demarrage ---
foreach ($v in 'EXO_APP_ID', 'EXO_ORG', 'EXO_CERT_PATH', 'EXO_CERT_PASSWORD', 'EXO_BRIDGE_SECRET') {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($v))) {
        Write-Error "Variable d'environnement manquante ou vide : $v"
        exit 1
    }
}
if (-not (Test-Path $env:EXO_CERT_PATH)) {
    Write-Error "Certificat introuvable : $($env:EXO_CERT_PATH) (montez le .pfx via un volume)"
    exit 1
}

Start-PodeServer -Threads 2 {

    Add-PodeEndpoint -Address 0.0.0.0 -Port ([int]($env:BRIDGE_PORT ?? 8080)) -Protocol Http

    # Rend les cmdlets EXO + nos helpers disponibles dans tous les runspaces de routes
    Import-PodeModule -Name ExchangeOnlineManagement
    Import-PodeModule -Path '/app/ExoHelpers.psm1'

    # --- Auth : secret partage exige sur toutes les routes sauf /health ---
    Add-PodeMiddleware -Name 'BridgeAuth' -ScriptBlock {
        if ($WebEvent.Path -eq '/health') { return $true }
        $provided = Get-PodeHeader -Name 'X-Bridge-Secret'
        if ([string]::IsNullOrEmpty($provided) -or $provided -ne $env:EXO_BRIDGE_SECRET) {
            Set-PodeResponseStatus -Code 401
            Write-PodeJsonResponse -Value @{ error = 'unauthorized' }
            return $false
        }
        return $true
    }

    # --- Health : n'ouvre PAS de connexion EXO (sonde legere) ---
    Add-PodeRoute -Method Get -Path '/health' -ScriptBlock {
        $connected = $false
        try {
            $conn = Get-ConnectionInformation -ErrorAction SilentlyContinue
            $connected = [bool]($conn | Where-Object { $_.State -eq 'Connected' })
        }
        catch { }
        Write-PodeJsonResponse -Value @{
            status       = 'ok'
            org          = $env:EXO_ORG
            exoConnected = $connected
        }
    }

    # --- Diagnostic : prouve qu'une vraie cmdlet EXO passe de bout en bout ---
    Add-PodeRoute -Method Get -Path '/diag/dl' -ScriptBlock {
        try {
            Connect-ExoIfNeeded
            $top = if ($WebEvent.Query['top']) { [int]$WebEvent.Query['top'] } else { 5 }
            $dls = Get-DistributionGroup -ResultSize $top |
                Select-Object DisplayName, PrimarySmtpAddress, GroupType, RecipientType
            Write-PodeJsonResponse -Value @{ count = @($dls).Count; groups = @($dls) }
        }
        catch {
            # Log complet vers stderr (visible dans `docker compose logs exo-bridge`)
            [Console]::Error.WriteLine("DIAG_DL_ERROR: " + ($_ | Out-String))
            # Statut 200 volontaire ici : un code >= 400 declenche la page d'erreur HTML
            # de Pode qui ecrase le JSON. On expose l'erreur dans le corps a la place.
            Write-PodeJsonResponse -Value @{ ok = $false; error = $_.Exception.Message }
        }
    }

    # --- Membres d'une liste de distribution / groupe a extension messagerie ---
    # Body JSON : { groupSmtp, member, action: "add" | "remove" }
    # Convention : toujours HTTP 200 + { ok: bool, error? } (evite la page d'erreur HTML de Pode).
    Add-PodeRoute -Method Post -Path '/dl/members' -ScriptBlock {
        try {
            $group  = $WebEvent.Data.groupSmtp
            $member = $WebEvent.Data.member
            $action = $WebEvent.Data.action

            if ([string]::IsNullOrWhiteSpace($group) -or
                [string]::IsNullOrWhiteSpace($member) -or
                $action -notin @('add', 'remove')) {
                Write-PodeJsonResponse -Value @{ ok = $false; error = 'parametres invalides (groupSmtp, member, action)' }
                return
            }

            Connect-ExoIfNeeded

            if ($action -eq 'add') {
                Add-DistributionGroupMember -Identity $group -Member $member `
                    -BypassSecurityGroupManagerCheck -ErrorAction Stop
            }
            else {
                Remove-DistributionGroupMember -Identity $group -Member $member `
                    -BypassSecurityGroupManagerCheck -Confirm:$false -ErrorAction Stop
            }

            Write-PodeJsonResponse -Value @{ ok = $true }
        }
        catch {
            [Console]::Error.WriteLine("DL_MEMBERS_ERROR: " + ($_ | Out-String))
            Write-PodeJsonResponse -Value @{ ok = $false; error = $_.Exception.Message }
        }
    }
}
