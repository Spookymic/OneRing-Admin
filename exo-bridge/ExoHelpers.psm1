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

# =====================================================================================
# Index des delegations des boites partagees (FullAccess + SendAs + SendOnBehalf)
#
# Exchange n'offre pas de recherche inverse "boites sur lesquelles X a FullAccess / SendAs" : il faut
# lire les permissions de CHAQUE boite partagee (2 appels par boite, plusieurs minutes sur un gros tenant).
# On construit donc un index une fois, par tranches de quelques secondes (le pont est mono-thread :
# un scan d'un bloc bloquerait toutes les autres requetes et depasserait le timeout HTTP cote Next).
#   - $script:MbxIndexReady : dernier index complet (sert les lectures, meme perime)
#   - $script:MbxIndexBuild : index en cours de construction (avance a chaque appel)
# Etat de module : partage par toutes les routes car le serveur tourne avec -Threads 1.
# =====================================================================================

$script:MbxIndexReady = $null
$script:MbxIndexBuild = $null
$script:MbxIndexTtlMinutes = 30
$script:MbxIndexStepSeconds = 8

function New-KeySet {
    # Virgule : sinon PowerShell deroule la collection au retour (un HashSet vide devient $null)
    return ,([System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase))
}

# Identifiants possibles d'un destinataire : les cmdlets renvoient le trustee sous des formes
# variables (UPN, Name, DN...). Pas le DisplayName (homonymes).
function Get-RecipientKeys([string]$Identity) {
    $keys = New-KeySet
    [void]$keys.Add($Identity)
    $r = Get-Recipient -Identity $Identity -ErrorAction SilentlyContinue
    if ($r) {
        foreach ($i in @($r.Name, $r.Alias, $r.DistinguishedName, "$($r.Identity)", "$($r.PrimarySmtpAddress)",
                         $r.WindowsLiveID, $r.ExternalDirectoryObjectId, "$($r.Guid)")) {
            if (-not [string]::IsNullOrWhiteSpace("$i")) { [void]$keys.Add("$i") }
        }
    }
    return ,$keys
}

# Demarre une construction (1 appel : liste des boites partagees + GrantSendOnBehalfTo).
function Start-MbxIndexBuild {
    if ($script:MbxIndexBuild) { return }
    $shared = @(Get-EXOMailbox -RecipientTypeDetails SharedMailbox -ResultSize Unlimited `
        -Properties GrantSendOnBehalfTo, ExternalDirectoryObjectId, Name, Alias, DisplayName -ErrorAction Stop)
    $entries = @{}
    $aliases = @{}
    foreach ($m in $shared) {
        $smtp = "$($m.PrimarySmtpAddress)"
        $key = $smtp.ToLower()
        $sob = New-KeySet
        foreach ($t in $m.GrantSendOnBehalfTo) { [void]$sob.Add("$t") }
        $entries[$key] = @{
            id           = if ($m.ExternalDirectoryObjectId) { "$($m.ExternalDirectoryObjectId)" } else { "$($m.Guid)" }
            displayName  = "$($m.DisplayName)"
            mail         = $smtp
            fullAccess   = New-KeySet
            sendAs       = New-KeySet
            sendOnBehalf = $sob
        }
        # Get-EXORecipientPermission renvoie Identity = Name de la boite
        foreach ($i in @($m.Name, "$($m.Identity)", $m.Alias, $smtp, $m.ExternalDirectoryObjectId)) {
            if (-not [string]::IsNullOrWhiteSpace("$i")) { $aliases["$i".ToLower()] = $key }
        }
    }
    $script:MbxIndexBuild = @{
        startedAt = Get-Date
        builtAt   = $null
        entries   = $entries
        aliases   = $aliases
        queue     = [System.Collections.Generic.Queue[string]]::new([string[]]@($entries.Keys))
        total     = $entries.Count
        failed    = 0
    }
}

# Avance la construction pendant au plus MbxIndexStepSeconds. Bascule l'index quand il est complet.
function Step-MbxIndexBuild {
    $b = $script:MbxIndexBuild
    if (-not $b) { return }
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($b.queue.Count -gt 0 -and $sw.Elapsed.TotalSeconds -lt $script:MbxIndexStepSeconds) {
        $key = $b.queue.Dequeue()
        $entry = $b.entries[$key]
        try {
            Get-EXOMailboxPermission -Identity $entry.mail -ErrorAction Stop | ForEach-Object {
                if ($_.AccessRights -contains 'FullAccess' -and -not $_.IsInherited -and "$($_.User)" -notlike 'NT AUTHORITY\*') {
                    [void]$entry.fullAccess.Add("$($_.User)")
                }
            }
            # -Trustee seul est refuse par EXO (Identity requise) : SendAs est donc lu boite par boite.
            Get-EXORecipientPermission -Identity $entry.mail -ErrorAction Stop | ForEach-Object {
                if ($_.AccessRights -contains 'SendAs' -and "$($_.Trustee)" -notlike 'NT AUTHORITY\*') {
                    [void]$entry.sendAs.Add("$($_.Trustee)")
                }
            }
        }
        catch {
            $b.failed++
            [Console]::Error.WriteLine("MBX_INDEX_PERM_ERROR [$($entry.mail)]: " + $_.Exception.Message)
        }
    }
    if ($b.queue.Count -eq 0) {
        $b.builtAt = Get-Date
        $script:MbxIndexReady = $b
        $script:MbxIndexBuild = $null
    }
}

# A appeler a chaque lecture : demarre / avance la construction si necessaire.
function Update-MbxIndex([bool]$Refresh = $false) {
    $ready = $script:MbxIndexReady
    $expired = $ready -and ((Get-Date) - $ready.builtAt).TotalMinutes -ge $script:MbxIndexTtlMinutes
    if (-not $script:MbxIndexBuild -and (-not $ready -or $expired -or $Refresh)) {
        Start-MbxIndexBuild
    }
    Step-MbxIndexBuild
}

function Get-MbxIndexStatus {
    $ready = $script:MbxIndexReady
    $b = $script:MbxIndexBuild
    return @{
        ready    = [bool]$ready
        building = [bool]$b
        done     = if ($b) { $b.total - $b.queue.Count } else { 0 }
        total    = if ($b) { $b.total } elseif ($ready) { $ready.total } else { 0 }
        builtAt  = if ($ready) { $ready.builtAt.ToUniversalTime().ToString('o') } else { $null }
        failed   = if ($ready) { $ready.failed } else { 0 }
    }
}

# Boites partagees accessibles par chaque utilisateur (index pret requis).
function Get-MbxAccessForUsers([string[]]$Users) {
    $idx = $script:MbxIndexReady
    $access = @{}
    foreach ($u in $Users) {
        $keys = Get-RecipientKeys $u
        $res = @()
        foreach ($e in $idx.entries.Values) {
            $fa = $e.fullAccess.Overlaps($keys)
            $sa = $e.sendAs.Overlaps($keys)
            $sob = $e.sendOnBehalf.Overlaps($keys)
            if ($fa -or $sa -or $sob) {
                $res += @{ id = $e.id; displayName = $e.displayName; mail = $e.mail
                           fullAccess = $fa; sendAs = $sa; sendOnBehalf = $sob }
            }
        }
        $access[$u] = @($res)
    }
    return $access
}

# Repercute une delegation ajoutee/retiree par le pont dans les index (evite un scan complet).
function Update-MbxIndexEntry([string]$Mailbox, [string]$Member, [string]$Type, [string]$Action) {
    if ($Type -notin @('fullAccess', 'sendAs', 'sendOnBehalf')) { return }
    $memberKeys = $null
    foreach ($idx in @($script:MbxIndexReady, $script:MbxIndexBuild)) {
        if (-not $idx) { continue }
        $key = $idx.aliases["$Mailbox".ToLower()]
        if (-not $key) { continue }
        $set = $idx.entries[$key][$Type]
        if ($Action -eq 'add') {
            [void]$set.Add($Member)
        }
        else {
            if (-not $memberKeys) { $memberKeys = Get-RecipientKeys $Member }
            $set.ExceptWith($memberKeys)
        }
    }
}

Export-ModuleMember -Function Connect-ExoIfNeeded, Get-RecipientKeys, Update-MbxIndex, Get-MbxIndexStatus, `
    Get-MbxAccessForUsers, Update-MbxIndexEntry
