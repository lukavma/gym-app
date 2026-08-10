# Azure provisioning and GitHub OIDC setup

One-time, human-run setup for the Azure resources and GitHub Actions federation described in [ADR-009](../architecture/adr/ADR-009-azure-platform.md).

This guide is written for **Windows PowerShell using the Azure CLI (`az`)**.

No Terraform/Bicep/Pulumi — the current Azure footprint is intentionally small and does not justify an additional IaC layer per ADR-009.

## Prerequisites

Run from a machine with:

* Azure CLI installed
* PowerShell
* an authenticated Azure session (`az login`)
* sufficient permissions to:

  * create resources in the target subscription
  * create an Entra application/service principal
  * create role assignments
  * create federated identity credentials

Optional but useful for verification:

* PostgreSQL `psql` client
* GitHub CLI (`gh`)

**Status: PENDING HUMAN VERIFICATION.**

These commands are intended to be run manually. Do not treat this document itself as evidence that the resources exist.

---

## 1. Select subscription and define names

First authenticate:

```powershell
az login
az account show --output table
```

If you have multiple Azure subscriptions, explicitly select the correct one:

```powershell
az account set --subscription "<subscription-id-or-name>"
az account show --output table
```

Define the deployment naming:

```powershell
$env:WORKLOAD = "gymapp"
$env:ENVIRONMENT = "prod"

$env:LOCATION = "westeurope"
$env:REGION_SHORT = "weu"

# Stable suffix for globally unique resource names.
$env:UNIQUE = "martis01"

# Resource Group
$env:RESOURCE_GROUP = "rg-$($env:WORKLOAD)-$($env:ENVIRONMENT)-$($env:REGION_SHORT)"

# PostgreSQL Flexible Server
$env:POSTGRES_SERVER_NAME = "psql-$($env:WORKLOAD)-$($env:ENVIRONMENT)-$($env:REGION_SHORT)-$($env:UNIQUE)"
$env:POSTGRES_ADMIN_USER = "gymappadmin"
$env:POSTGRES_DB_NAME = "gymapp"

# App Service
$env:APP_SERVICE_PLAN = "asp-$($env:WORKLOAD)-$($env:ENVIRONMENT)-$($env:REGION_SHORT)"
$env:WEBAPP_NAME = "app-$($env:WORKLOAD)-$($env:ENVIRONMENT)-$($env:REGION_SHORT)-$($env:UNIQUE)"

# Monitoring
$env:LOG_ANALYTICS_WORKSPACE = "log-$($env:WORKLOAD)-$($env:ENVIRONMENT)-$($env:REGION_SHORT)"
$env:APP_INSIGHTS_NAME = "appi-$($env:WORKLOAD)-$($env:ENVIRONMENT)-$($env:REGION_SHORT)"

# GitHub / OIDC identity
$env:GITHUB_ORG = "lukavma"
$env:GITHUB_REPO = "gym-app"
$env:GITHUB_ENVIRONMENT = "production"

$env:OIDC_APP_NAME = "gha-$($env:WORKLOAD)-$($env:ENVIRONMENT)"
```

Check the resulting names before creating anything:

```powershell
$env:RESOURCE_GROUP
$env:POSTGRES_SERVER_NAME
$env:APP_SERVICE_PLAN
$env:WEBAPP_NAME
$env:LOG_ANALYTICS_WORKSPACE
$env:APP_INSIGHTS_NAME
$env:OIDC_APP_NAME
```

Expected shape:

```text
rg-gymapp-prod-weu
asp-gymapp-prod-weu
app-gymapp-prod-weu-martis01
psql-gymapp-prod-weu-martis01
log-gymapp-prod-weu
appi-gymapp-prod-weu
gha-gymapp-prod
```

The PostgreSQL server name and Web App name must be globally unique.

---

## 2. Create the Resource Group

```powershell
az group create `
  --name $env:RESOURCE_GROUP `
  --location $env:LOCATION
```

Verify:

```powershell
az group show `
  --name $env:RESOURCE_GROUP `
  --output table
```

---

## 3. Azure Database for PostgreSQL Flexible Server

Target configuration:

* PostgreSQL 16
* Burstable B1ms
* 32 GiB storage
* West Europe (Postgres Flexible Server provisioning is currently restricted in Germany West Central for this subscription — see ADR-009 amendment)
* public networking for MVP
* TLS required by the application connection string
* 7-day backup retention / PITR
* no HA
* no VNet/private endpoint

### 3.1 Generate the PostgreSQL administrator password

Generate a strong random password locally:

```powershell
$POSTGRES_ADMIN_PASSWORD = "Aa1!" + `
  [Convert]::ToHexString(
    [Security.Cryptography.RandomNumberGenerator]::GetBytes(20)
  ).ToLowerInvariant()
```

Display it once:

```powershell
$POSTGRES_ADMIN_PASSWORD
```

**Store this password in your password manager before continuing.**

Do not commit it to the repository.

### 3.2 Create the server

`--public-access None` creates the server with public networking enabled but without automatically creating a client firewall rule. Firewall rules are added explicitly afterwards.

```powershell
az postgres flexible-server create `
  --resource-group $env:RESOURCE_GROUP `
  --name $env:POSTGRES_SERVER_NAME `
  --location $env:LOCATION `
  --version 16 `
  --sku-name Standard_B1ms `
  --tier Burstable `
  --storage-size 32 `
  --admin-user $env:POSTGRES_ADMIN_USER `
  --admin-password $POSTGRES_ADMIN_PASSWORD `
  --public-access None `
  --high-availability Disabled `
  --backup-retention 7
```

Verify:

```powershell
az postgres flexible-server show `
  --resource-group $env:RESOURCE_GROUP `
  --name $env:POSTGRES_SERVER_NAME `
  --output table
```

### 3.3 Allow Azure-hosted resources

The MVP architecture currently uses the PostgreSQL firewall rule `0.0.0.0`, allowing Azure-hosted resources to reach the server.

```powershell
az postgres flexible-server firewall-rule create `
  --resource-group $env:RESOURCE_GROUP `
  --server-name $env:POSTGRES_SERVER_NAME `
  --name "allow-azure-services" `
  --start-ip-address "0.0.0.0" `
  --end-ip-address "0.0.0.0"
```

This is intentionally the simple MVP networking model from ADR-009.

A later move to VNet integration/private networking is explicitly out of scope unless there is a real need.

### 3.4 Allow your current public IP

Determine your current public IP:

```powershell
$MY_IP = (Invoke-RestMethod -Uri "https://api.ipify.org").Trim()

$MY_IP
```

Add it:

```powershell
az postgres flexible-server firewall-rule create `
  --resource-group $env:RESOURCE_GROUP `
  --server-name $env:POSTGRES_SERVER_NAME `
  --name "allow-my-ip" `
  --start-ip-address $MY_IP `
  --end-ip-address $MY_IP
```

### 3.5 Create the application database

```powershell
az postgres flexible-server db create `
  --resource-group $env:RESOURCE_GROUP `
  --server-name $env:POSTGRES_SERVER_NAME `
  --name $env:POSTGRES_DB_NAME
```

Verify:

```powershell
az postgres flexible-server db list `
  --resource-group $env:RESOURCE_GROUP `
  --server-name $env:POSTGRES_SERVER_NAME `
  --output table
```

---

## 4. Build the production DATABASE_URL

URL-encode the password before embedding it in the PostgreSQL URI:

```powershell
$ENCODED_POSTGRES_PASSWORD = [Uri]::EscapeDataString($POSTGRES_ADMIN_PASSWORD)
```

Build the connection string:

```powershell
$DATABASE_URL = "postgresql://$($env:POSTGRES_ADMIN_USER):$ENCODED_POSTGRES_PASSWORD@$($env:POSTGRES_SERVER_NAME).postgres.database.azure.com:5432/$($env:POSTGRES_DB_NAME)?sslmode=require"
```

Do not print the complete URL unnecessarily because it contains the database password.

You can verify only the host portion:

```powershell
Write-Host "PostgreSQL host:"
Write-Host "$($env:POSTGRES_SERVER_NAME).postgres.database.azure.com"
```

If `psql` is installed, connectivity can later be tested with:

```powershell
psql $DATABASE_URL -c "select 1;"
```

Do not continue troubleshooting application code until basic PostgreSQL connectivity succeeds.

---

## 5. App Service — Linux / Node 24 / Basic B1

Before creating the Web App, verify that the expected Node 24 runtime is available in the current App Service runtime list:

```powershell
az webapp list-runtimes `
  --os linux `
  --output tsv | Select-String "NODE"
```

`list-runtimes` prints identifiers pipe-separated (e.g. `NODE|24-lts`), but `az webapp create --runtime` still expects colon syntax (`NODE:24-lts`) per its own `--help` and examples — this is a known inconsistency in the Azure CLI, not a typo. Confirm `NODE|24-lts` (or whatever the current Node 24 LTS line reads) appears in the output, then use the colon form below regardless of what `list-runtimes` printed.

The architecture expects Node 24 LTS to be listed with `Active` status (Node 24 is Active LTS until April 2028; if that's changed, stop and reconsider before creating the Web App).

### 5.1 Create App Service Plan

```powershell
az appservice plan create `
  --resource-group $env:RESOURCE_GROUP `
  --name $env:APP_SERVICE_PLAN `
  --location $env:LOCATION `
  --is-linux `
  --sku B1
```

### 5.2 Create the Web App

```powershell
az webapp create `
  --resource-group $env:RESOURCE_GROUP `
  --plan $env:APP_SERVICE_PLAN `
  --name $env:WEBAPP_NAME `
  --runtime "NODE:24-lts"
```

### 5.3 Configure the application

```powershell
az webapp config set `
  --resource-group $env:RESOURCE_GROUP `
  --name $env:WEBAPP_NAME `
  --always-on true `
  --startup-file "node server.js"
```

Require HTTPS:

```powershell
az webapp update `
  --resource-group $env:RESOURCE_GROUP `
  --name $env:WEBAPP_NAME `
  --https-only true
```

Verify:

```powershell
az webapp show `
  --resource-group $env:RESOURCE_GROUP `
  --name $env:WEBAPP_NAME `
  --query "{name:name,state:state,host:defaultHostName,httpsOnly:httpsOnly}" `
  --output table
```

---

## 6. Application Insights and Log Analytics

Application Insights is workspace-based.

Explicitly ensure the Azure CLI Application Insights extension is available:

```powershell
az extension add `
  --name application-insights `
  --upgrade
```

### 6.1 Create Log Analytics workspace

```powershell
az monitor log-analytics workspace create `
  --resource-group $env:RESOURCE_GROUP `
  --workspace-name $env:LOG_ANALYTICS_WORKSPACE `
  --location $env:LOCATION
```

Get the workspace resource ID:

```powershell
$WORKSPACE_ID = az monitor log-analytics workspace show `
  --resource-group $env:RESOURCE_GROUP `
  --workspace-name $env:LOG_ANALYTICS_WORKSPACE `
  --query id `
  --output tsv
```

### 6.2 Create Application Insights

```powershell
az monitor app-insights component create `
  --resource-group $env:RESOURCE_GROUP `
  --app $env:APP_INSIGHTS_NAME `
  --location $env:LOCATION `
  --workspace $WORKSPACE_ID
```

Retrieve the connection string:

```powershell
$APPINSIGHTS_CONNECTION_STRING = az monitor app-insights component show `
  --resource-group $env:RESOURCE_GROUP `
  --app $env:APP_INSIGHTS_NAME `
  --query connectionString `
  --output tsv
```

Do not print the connection string unnecessarily.

---

## 7. Generate SESSION_SECRET

Generate a cryptographically random 32-byte session secret:

```powershell
$SESSION_SECRET = [Convert]::ToBase64String(
  [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
)
```

Do not commit this value.

---

## 8. Configure App Service App Settings

The accepted MVP configuration uses App Service App Settings rather than Azure Key Vault.

Configure:

* `DATABASE_URL`
* `SESSION_SECRET`
* `APPLICATIONINSIGHTS_CONNECTION_STRING`

```powershell
az webapp config appsettings set `
  --resource-group $env:RESOURCE_GROUP `
  --name $env:WEBAPP_NAME `
  --settings `
    "DATABASE_URL=$DATABASE_URL" `
    "SESSION_SECRET=$SESSION_SECRET" `
    "APPLICATIONINSIGHTS_CONNECTION_STRING=$APPINSIGHTS_CONNECTION_STRING"
```

Verify only the setting names, not their secret values:

```powershell
az webapp config appsettings list `
  --resource-group $env:RESOURCE_GROUP `
  --name $env:WEBAPP_NAME `
  --query "[].name" `
  --output table
```

Expected application settings include:

```text
DATABASE_URL
SESSION_SECRET
APPLICATIONINSIGHTS_CONNECTION_STRING
```

---

## 9. GitHub OIDC federation

The deployment workflow authenticates to Azure using GitHub Actions OIDC.

No client secret or publish profile is required for the primary deployment path.

The deployment job uses the GitHub Environment:

```text
production
```

Therefore the federated credential should trust that environment specifically.

### 9.1 Create the Entra application

```powershell
$APP_ID = az ad app create `
  --display-name $env:OIDC_APP_NAME `
  --query appId `
  --output tsv
```

Create its service principal:

```powershell
az ad sp create --id $APP_ID
```

Retrieve subscription and tenant IDs:

```powershell
$SUBSCRIPTION_ID = az account show `
  --query id `
  --output tsv

$TENANT_ID = az account show `
  --query tenantId `
  --output tsv
```

### 9.2 Grant deployment permissions

Scope the identity to this Resource Group rather than the entire subscription:

```powershell
az role assignment create `
  --assignee $APP_ID `
  --role Contributor `
  --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$($env:RESOURCE_GROUP)"
```

### 9.3 Create the federated credential

Create a temporary JSON file to avoid PowerShell/JSON quoting problems:

```powershell
$FEDERATED_CREDENTIAL_FILE = Join-Path $env:TEMP "gymapp-github-federation.json"

$FEDERATED_CREDENTIAL = @{
  name = "gymapp-production-environment"
  issuer = "https://token.actions.githubusercontent.com"
  subject = "repo:$($env:GITHUB_ORG)/$($env:GITHUB_REPO):environment:$($env:GITHUB_ENVIRONMENT)"
  description = "GitHub Actions production deployment for gymapp"
  audiences = @(
    "api://AzureADTokenExchange"
  )
}

$FEDERATED_CREDENTIAL |
  ConvertTo-Json -Depth 5 |
  Set-Content `
    -Path $FEDERATED_CREDENTIAL_FILE `
    -Encoding utf8
```

Inspect it before submission:

```powershell
Get-Content $FEDERATED_CREDENTIAL_FILE
```

Create the credential:

```powershell
az ad app federated-credential create `
  --id $APP_ID `
  --parameters $FEDERATED_CREDENTIAL_FILE
```

Remove the temporary file:

```powershell
Remove-Item $FEDERATED_CREDENTIAL_FILE
```

Verify:

```powershell
az ad app federated-credential list `
  --id $APP_ID `
  --output table
```

### 9.4 Record GitHub configuration values

These are identifiers, not credentials:

```powershell
Write-Host "AZURE_CLIENT_ID=$APP_ID"
Write-Host "AZURE_TENANT_ID=$TENANT_ID"
Write-Host "AZURE_SUBSCRIPTION_ID=$SUBSCRIPTION_ID"
Write-Host "AZURE_RESOURCE_GROUP=$($env:RESOURCE_GROUP)"
Write-Host "AZURE_POSTGRES_SERVER_NAME=$($env:POSTGRES_SERVER_NAME)"
Write-Host "AZURE_WEBAPP_NAME=$($env:WEBAPP_NAME)"
```

Save these for the GitHub Environment configuration.

---

## 10. GitHub repository configuration

In GitHub:

**Repository → Settings → Environments → New environment**

Create:

```text
production
```

This must match the environment referenced by `.github/workflows/deploy.yml` and the OIDC federated credential.

Add the following values as **environment secrets**:

| Secret                       | Value                       |
| ---------------------------- | --------------------------- |
| `AZURE_CLIENT_ID`            | `$APP_ID`                   |
| `AZURE_TENANT_ID`            | `$TENANT_ID`                |
| `AZURE_SUBSCRIPTION_ID`      | `$SUBSCRIPTION_ID`          |
| `AZURE_RESOURCE_GROUP`       | `$env:RESOURCE_GROUP`       |
| `AZURE_POSTGRES_SERVER_NAME` | `$env:POSTGRES_SERVER_NAME` |
| `AZURE_WEBAPP_NAME`          | `$env:WEBAPP_NAME`          |
| `DATABASE_URL`               | `$DATABASE_URL`             |
| `SESSION_SECRET`             | `$SESSION_SECRET`           |

No:

```text
AZURE_CLIENT_SECRET
```

is required for the OIDC deployment path.

Do not add a publish profile unless OIDC is genuinely unavailable.

---

## 11. GitHub deployment permissions

Verify that `.github/workflows/deploy.yml` contains the permissions required by `azure/login` with OIDC.

The deployment job should include:

```yaml
permissions:
  contents: read
  id-token: write
```

and:

```yaml
environment: production
```

The environment name is significant because the federated identity credential is scoped to:

```text
repo:<org>/<repo>:environment:production
```

The workflow should authenticate using the GitHub Environment values:

```yaml
- uses: azure/login@v2
  with:
    client-id: ${{ secrets.AZURE_CLIENT_ID }}
    tenant-id: ${{ secrets.AZURE_TENANT_ID }}
    subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
```

Do not replace OIDC with a stored Azure client secret.

---

## 12. Database migration path

Before the first production deployment, confirm that the production `DATABASE_URL` is correct.

If `psql` is available:

```powershell
psql $DATABASE_URL -c "select version();"
```

Then apply the Phase 0 migration using the repository's documented migration command, for example:

```powershell
$env:DATABASE_URL = $DATABASE_URL

pnpm db:migrate
```

Use the actual migration command defined in `package.json` if it differs.

After migration, verify the expected Phase 0 tables:

```powershell
psql $DATABASE_URL -c "\dt"
```

Expected application tables:

```text
users
auth_throttle
```

Do not manually create future-phase tables.

---

## 13. GitHub Actions deployment

Once the repository has been pushed and the GitHub Environment is configured:

```powershell
git status
git push origin main
```

The push should trigger the repository workflows according to their configured triggers.

The production deployment flow is expected to perform:

```text
quality gates
→ production build
→ temporary PostgreSQL firewall access for the GitHub runner if required
→ Drizzle migration
→ Azure OIDC login
→ Azure App Service deployment
```

The deploy workflow is responsible for cleaning up temporary per-run firewall rules.

A failed migration must prevent the production deployment from proceeding.

---

## 14. Post-deployment verification

### 14.1 PostgreSQL

Check server state:

```powershell
az postgres flexible-server show `
  --resource-group $env:RESOURCE_GROUP `
  --name $env:POSTGRES_SERVER_NAME `
  --query "{name:name,state:state,version:version,location:location}" `
  --output table
```

Expected state:

```text
Ready
```

Test connectivity:

```powershell
psql $DATABASE_URL -c "select 1;"
```

---

### 14.2 App Service

Check application state:

```powershell
az webapp show `
  --resource-group $env:RESOURCE_GROUP `
  --name $env:WEBAPP_NAME `
  --query "{name:name,state:state,url:defaultHostName,httpsOnly:httpsOnly}" `
  --output table
```

Get the application URL:

```powershell
$APP_URL = "https://$($env:WEBAPP_NAME).azurewebsites.net"

$APP_URL
```

Open it:

```powershell
Start-Process $APP_URL
```

The first visit should expose the first-run setup path while no user exists.

---

### 14.3 First-run authentication

Verify manually:

1. Open the deployed application.
2. Complete first-run setup.
3. Confirm the account is created.
4. Confirm setup/registration is no longer reachable.
5. Confirm login works.
6. Confirm authentication reaches the empty **Today** shell.
7. Confirm unauthenticated access to protected routes redirects/rejects correctly.

---

### 14.4 Application Insights

Generate several application requests, then open:

```text
Azure Portal
→ Application Insights
→ appi-gymapp-prod-weu
→ Live Metrics
```

Confirm that application traffic is arriving.

Also inspect:

```text
Transaction search
Failures
Logs
```

No custom dashboards or alerting are required for Phase 0.

---

## 15. PWA / iPhone verification

After production deployment:

1. Open the deployed HTTPS URL in Safari on the iPhone.
2. Add the application to the Home Screen.
3. Launch it from the Home Screen.
4. Confirm it launches in standalone PWA mode.
5. Authenticate.
6. Reach the Today shell.
7. Close and reopen the PWA.
8. Confirm the shell remains usable according to the Phase 0 caching behavior.
9. Test the Phase 0 offline shell behavior in airplane mode.

Full workout offline synchronization is not part of Phase 0.

---

## 16. Verification checklist

### Azure resources

* [ ] Correct Azure subscription selected
* [ ] `rg-gymapp-prod-weu` exists
* [ ] PostgreSQL Flexible Server state is `Ready`
* [ ] PostgreSQL 16 configured
* [ ] `gymapp` database exists
* [ ] local PostgreSQL connectivity succeeds
* [ ] Phase 0 Drizzle migration applied
* [ ] `users` and `auth_throttle` exist
* [ ] App Service Plan exists
* [ ] Web App state is `Running`
* [ ] HTTPS-only enabled
* [ ] Always On enabled

### Monitoring

* [ ] Log Analytics workspace exists
* [ ] Application Insights exists
* [ ] App Service has `APPLICATIONINSIGHTS_CONNECTION_STRING`
* [ ] Live Metrics receives traffic

### GitHub / OIDC

* [ ] Entra application exists
* [ ] Service principal exists
* [ ] Contributor role is scoped to the Resource Group
* [ ] `production` federated credential exists
* [ ] GitHub `production` Environment exists
* [ ] required environment secrets configured
* [ ] no `AZURE_CLIENT_SECRET`
* [ ] workflow contains `id-token: write`
* [ ] workflow uses `environment: production`

### CI/CD

* [ ] push to `main` triggers CI
* [ ] CI is green on Linux
* [ ] standalone Next.js production build succeeds
* [ ] deploy workflow authenticates through OIDC
* [ ] migration succeeds
* [ ] App Service deployment succeeds
* [ ] temporary DB firewall rule is removed after deployment

### Application

* [ ] HTTPS endpoint loads
* [ ] first-run setup works
* [ ] second registration is impossible
* [ ] login works
* [ ] authenticated Today shell loads
* [ ] Application Insights receives telemetry

### PWA

* [ ] installable on physical iPhone
* [ ] launches from Home Screen
* [ ] standalone mode works
* [ ] Phase 0 cached shell works offline

---

## 17. Final expected resource layout

The Azure Resource Group should contain approximately:

```text
rg-gymapp-prod-weu
│
├── asp-gymapp-prod-weu
│   └── app-gymapp-prod-weu-martis01
│
├── psql-gymapp-prod-weu-martis01
│   └── gymapp
│
├── log-gymapp-prod-weu
│
└── appi-gymapp-prod-weu
```

The GitHub deployment identity is an Entra object rather than a Resource Group resource:

```text
gha-gymapp-prod
└── Federated credential:
    repo:<org>/<repo>:environment:production
```

No Vercel, Neon, AKS, Container Apps, Key Vault, API Management, Service Bus, or additional infrastructure is required for Phase 0.
