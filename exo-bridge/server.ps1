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

# -Threads 1 : un seul runspace traite les requetes. Indispensable avec EXO v3 :
# l'etat de connexion est global au process, mais les cmdlets proxy (Add/Remove-
# DistributionGroupMember, etc.) ne sont importees que dans le runspace qui a appele
# Connect-ExchangeOnline. Avec plusieurs runspaces, une requete pouvait tomber sur un
# runspace "connecte" mais sans les cmdlets -> "term not recognized" au 1er appel.
Start-PodeServer -Threads 1 {

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

    # --- Membres d'une DL : lecture typée (pour l'arborescence / imbrication) ---
    # GET /dl/members?group=<smtp>  →  { members: [{ id, displayName, mail, recipientTypeDetails, isGroup }] }
    Add-PodeRoute -Method Get -Path '/dl/members' -ScriptBlock {
        try {
            $group = $WebEvent.Query['group']
            if ([string]::IsNullOrWhiteSpace($group)) {
                Write-PodeJsonResponse -Value @{ ok = $false; error = 'parametre group requis' }
                return
            }
            Connect-ExoIfNeeded
            $members = @()
            Get-DistributionGroupMember -Identity $group -ResultSize Unlimited | ForEach-Object {
                $rtd = "$($_.RecipientTypeDetails)"
                $members += @{
                    id                  = $_.ExternalDirectoryObjectId
                    displayName         = $_.DisplayName
                    mail                = $_.PrimarySmtpAddress
                    recipientTypeDetails = $rtd
                    isGroup             = ($rtd -match 'Group')
                }
            }
            Write-PodeJsonResponse -Value @{ ok = $true; members = @($members) }
        }
        catch {
            [Console]::Error.WriteLine("DL_MEMBERS_GET_ERROR: " + ($_ | Out-String))
            Write-PodeJsonResponse -Value @{ ok = $false; error = $_.Exception.Message }
        }
    }

    # --- Propriétaires d'une DL (champ ManagedBy) : lecture ---
    # GET /dl/owners?group=<smtp>
    Add-PodeRoute -Method Get -Path '/dl/owners' -ScriptBlock {
        try {
            $group = $WebEvent.Query['group']
            if ([string]::IsNullOrWhiteSpace($group)) {
                Write-PodeJsonResponse -Value @{ ok = $false; error = 'parametre group requis' }
                return
            }
            Connect-ExoIfNeeded
            $dg = Get-DistributionGroup -Identity $group -ErrorAction Stop
            $owners = @()
            foreach ($m in $dg.ManagedBy) {
                $r = Get-Recipient -Identity $m -ErrorAction SilentlyContinue
                if ($r) {
                    $owners += @{
                        id          = $r.ExternalDirectoryObjectId
                        displayName = $r.DisplayName
                        mail        = $r.PrimarySmtpAddress
                    }
                }
            }
            Write-PodeJsonResponse -Value @{ ok = $true; owners = @($owners) }
        }
        catch {
            [Console]::Error.WriteLine("DL_OWNERS_GET_ERROR: " + ($_ | Out-String))
            Write-PodeJsonResponse -Value @{ ok = $false; error = $_.Exception.Message }
        }
    }

    # --- Propriétaires d'une DL : ajout / retrait ---
    # Body JSON : { groupSmtp, member, action: "add" | "remove" }
    Add-PodeRoute -Method Post -Path '/dl/owners' -ScriptBlock {
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
                Set-DistributionGroup -Identity $group -ManagedBy @{ Add = $member } `
                    -BypassSecurityGroupManagerCheck -ErrorAction Stop
            }
            else {
                Set-DistributionGroup -Identity $group -ManagedBy @{ Remove = $member } `
                    -BypassSecurityGroupManagerCheck -ErrorAction Stop
            }

            Write-PodeJsonResponse -Value @{ ok = $true }
        }
        catch {
            [Console]::Error.WriteLine("DL_OWNERS_POST_ERROR: " + ($_ | Out-String))
            Write-PodeJsonResponse -Value @{ ok = $false; error = $_.Exception.Message }
        }
    }

    # --- Création d'une liste de distribution ---
    # Body JSON : { displayName, alias }
    Add-PodeRoute -Method Post -Path '/dl' -ScriptBlock {
        try {
            $displayName = $WebEvent.Data.displayName
            $alias       = $WebEvent.Data.alias

            if ([string]::IsNullOrWhiteSpace($displayName) -or [string]::IsNullOrWhiteSpace($alias)) {
                Write-PodeJsonResponse -Value @{ ok = $false; error = 'parametres invalides (displayName, alias)' }
                return
            }

            Connect-ExoIfNeeded

            $dg = New-DistributionGroup -Name $displayName -DisplayName $displayName `
                -Alias $alias -Type Distribution -ErrorAction Stop

            Write-PodeJsonResponse -Value @{
                ok    = $true
                group = @{
                    id          = if ($dg.ExternalDirectoryObjectId) { $dg.ExternalDirectoryObjectId } else { $dg.Guid.ToString() }
                    displayName = $dg.DisplayName
                    mail        = $dg.PrimarySmtpAddress
                }
            }
        }
        catch {
            [Console]::Error.WriteLine("DL_CREATE_ERROR: " + ($_ | Out-String))
            Write-PodeJsonResponse -Value @{ ok = $false; error = $_.Exception.Message }
        }
    }

    # --- Boîtes partagées : liste ---
    Add-PodeRoute -Method Get -Path '/mailbox/shared' -ScriptBlock {
        try {
            Connect-ExoIfNeeded
            $list = @()
            Get-Mailbox -RecipientTypeDetails SharedMailbox -ResultSize Unlimited |
                ForEach-Object {
                    $list += @{
                        id          = if ($_.ExternalDirectoryObjectId) { $_.ExternalDirectoryObjectId } else { $_.Guid.ToString() }
                        displayName = $_.DisplayName
                        mail        = $_.PrimarySmtpAddress
                    }
                }
            Write-PodeJsonResponse -Value @{ ok = $true; mailboxes = @($list) }
        }
        catch {
            [Console]::Error.WriteLine("MBX_LIST_ERROR: " + ($_ | Out-String))
            Write-PodeJsonResponse -Value @{ ok = $false; error = $_.Exception.Message }
        }
    }

    # --- Boîte partagée : création ---
    # Body JSON : { displayName, alias }
    Add-PodeRoute -Method Post -Path '/mailbox/shared' -ScriptBlock {
        try {
            $displayName = $WebEvent.Data.displayName
            $alias       = $WebEvent.Data.alias
            if ([string]::IsNullOrWhiteSpace($displayName) -or [string]::IsNullOrWhiteSpace($alias)) {
                Write-PodeJsonResponse -Value @{ ok = $false; error = 'parametres invalides (displayName, alias)' }
                return
            }
            Connect-ExoIfNeeded
            $m = New-Mailbox -Shared -Name $displayName -DisplayName $displayName -Alias $alias -ErrorAction Stop
            Write-PodeJsonResponse -Value @{
                ok      = $true
                mailbox = @{
                    id          = if ($m.ExternalDirectoryObjectId) { $m.ExternalDirectoryObjectId } else { $m.Guid.ToString() }
                    displayName = $m.DisplayName
                    mail        = $m.PrimarySmtpAddress
                }
            }
        }
        catch {
            [Console]::Error.WriteLine("MBX_CREATE_ERROR: " + ($_ | Out-String))
            Write-PodeJsonResponse -Value @{ ok = $false; error = $_.Exception.Message }
        }
    }

    # --- Conversion d'une boîte en boîte partagée (offboarding) ---
    # Body JSON : { mailbox }
    Add-PodeRoute -Method Post -Path '/mailbox/convert-to-shared' -ScriptBlock {
        try {
            $mbx = $WebEvent.Data.mailbox
            if ([string]::IsNullOrWhiteSpace($mbx)) {
                Write-PodeJsonResponse -Value @{ ok = $false; error = 'parametre mailbox requis' }
                return
            }
            Connect-ExoIfNeeded
            Set-Mailbox -Identity $mbx -Type Shared -ErrorAction Stop
            Write-PodeJsonResponse -Value @{ ok = $true }
        }
        catch {
            [Console]::Error.WriteLine("MBX_CONVERT_ERROR: " + ($_ | Out-String))
            Write-PodeJsonResponse -Value @{ ok = $false; error = $_.Exception.Message }
        }
    }

    # --- Délégations d'une boîte : lecture ---
    # GET /mailbox/permissions?mailbox=<smtp>
    Add-PodeRoute -Method Get -Path '/mailbox/permissions' -ScriptBlock {
        try {
            $mbx = $WebEvent.Query['mailbox']
            if ([string]::IsNullOrWhiteSpace($mbx)) {
                Write-PodeJsonResponse -Value @{ ok = $false; error = 'parametre mailbox requis' }
                return
            }
            Connect-ExoIfNeeded

            function Resolve-Trustee($identity) {
                $r = Get-Recipient -Identity $identity -ErrorAction SilentlyContinue
                if ($r) {
                    return @{ id = $r.ExternalDirectoryObjectId; displayName = $r.DisplayName; mail = $r.PrimarySmtpAddress }
                }
                return @{ id = $null; displayName = "$identity"; mail = "$identity" }
            }

            $full = @()
            Get-MailboxPermission -Identity $mbx | Where-Object {
                $_.AccessRights -contains 'FullAccess' -and -not $_.IsInherited -and $_.User -notlike 'NT AUTHORITY\*'
            } | ForEach-Object { $full += (Resolve-Trustee $_.User) }

            $sendAs = @()
            Get-RecipientPermission -Identity $mbx | Where-Object {
                $_.AccessRights -contains 'SendAs' -and $_.Trustee -notlike 'NT AUTHORITY\*'
            } | ForEach-Object { $sendAs += (Resolve-Trustee $_.Trustee) }

            $onBehalf = @()
            foreach ($t in (Get-Mailbox -Identity $mbx).GrantSendOnBehalfTo) {
                $onBehalf += (Resolve-Trustee $t)
            }

            Write-PodeJsonResponse -Value @{
                ok           = $true
                fullAccess   = @($full)
                sendAs       = @($sendAs)
                sendOnBehalf = @($onBehalf)
            }
        }
        catch {
            [Console]::Error.WriteLine("MBX_PERM_GET_ERROR: " + ($_ | Out-String))
            Write-PodeJsonResponse -Value @{ ok = $false; error = $_.Exception.Message }
        }
    }

    # --- Délégations d'une boîte : ajout / retrait ---
    # Body JSON : { mailbox, member, type: fullAccess|sendAs|sendOnBehalf, action: add|remove }
    Add-PodeRoute -Method Post -Path '/mailbox/permissions' -ScriptBlock {
        try {
            $mbx    = $WebEvent.Data.mailbox
            $member = $WebEvent.Data.member
            $type   = $WebEvent.Data.type
            $action = $WebEvent.Data.action

            if ([string]::IsNullOrWhiteSpace($mbx) -or
                [string]::IsNullOrWhiteSpace($member) -or
                $type -notin @('fullAccess', 'sendAs', 'sendOnBehalf') -or
                $action -notin @('add', 'remove')) {
                Write-PodeJsonResponse -Value @{ ok = $false; error = 'parametres invalides (mailbox, member, type, action)' }
                return
            }

            Connect-ExoIfNeeded

            switch ($type) {
                'fullAccess' {
                    if ($action -eq 'add') {
                        Add-MailboxPermission -Identity $mbx -User $member -AccessRights FullAccess `
                            -InheritanceType All -AutoMapping $true -ErrorAction Stop | Out-Null
                    }
                    else {
                        Remove-MailboxPermission -Identity $mbx -User $member -AccessRights FullAccess `
                            -Confirm:$false -ErrorAction Stop | Out-Null
                    }
                }
                'sendAs' {
                    if ($action -eq 'add') {
                        Add-RecipientPermission -Identity $mbx -Trustee $member -AccessRights SendAs `
                            -Confirm:$false -ErrorAction Stop | Out-Null
                    }
                    else {
                        Remove-RecipientPermission -Identity $mbx -Trustee $member -AccessRights SendAs `
                            -Confirm:$false -ErrorAction Stop | Out-Null
                    }
                }
                'sendOnBehalf' {
                    if ($action -eq 'add') {
                        Set-Mailbox -Identity $mbx -GrantSendOnBehalfTo @{ Add = $member } -ErrorAction Stop
                    }
                    else {
                        Set-Mailbox -Identity $mbx -GrantSendOnBehalfTo @{ Remove = $member } -ErrorAction Stop
                    }
                }
            }

            Write-PodeJsonResponse -Value @{ ok = $true }
        }
        catch {
            [Console]::Error.WriteLine("MBX_PERM_POST_ERROR: " + ($_ | Out-String))
            Write-PodeJsonResponse -Value @{ ok = $false; error = $_.Exception.Message }
        }
    }
}
