# OneRing — Exchange Online bridge (sidecar PowerShell)
# PowerShell 7 sous Linux : le module ExchangeOnlineManagement v3 y fonctionne en app-only.
FROM mcr.microsoft.com/powershell:lts-debian-12

SHELL ["pwsh", "-NoLogo", "-NonInteractive", "-Command"]

# Modules : Pode (serveur HTTP) + ExchangeOnlineManagement (cmdlets EXO) + PnP.PowerShell (SharePoint admin)
RUN Set-PSRepository -Name PSGallery -InstallationPolicy Trusted; \
    Install-Module -Name Pode -Scope AllUsers -Force; \
    Install-Module -Name ExchangeOnlineManagement -MinimumVersion 3.0.0 -Scope AllUsers -Force; \
    Install-Module -Name PnP.PowerShell -Scope AllUsers -Force

WORKDIR /app
COPY server.ps1 ExoHelpers.psm1 server.psd1 ./

# Exécution en utilisateur non privilégié (finding M5) : une RCE dans Pode/EXO n'obtient
# pas root, alors que le conteneur monte le certificat app-only Exchange.
RUN useradd --system --uid 10001 --create-home --home-dir /home/bridge bridge \
    && chown -R bridge:bridge /app
USER bridge

# Aucun port publie cote hote : voir docker-compose.yml (reseau interne uniquement)
EXPOSE 8080

CMD ["pwsh", "-NoLogo", "-File", "/app/server.ps1"]
