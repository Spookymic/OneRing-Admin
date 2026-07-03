@{
    # Configuration Pode chargée automatiquement au démarrage.
    Server = @{
        Request = @{
            # Timeout de requête relevé à 15 min : le scan global des délégations orphelines
            # parcourt toutes les boîtes partagées (défaut Pode = 30 s → 408 sur gros volume).
            Timeout = 900
        }
    }
}
