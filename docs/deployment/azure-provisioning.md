# Azure provisioning and GitHub OIDC setup

One-time, human-run setup for the Azure resources and GitHub Actions
federation described in [ADR-009](../architecture/adr/ADR-009-azure-platform.md).
No Terraform/Bicep/Pulumi — four resources don't justify IaC (per the ADR).
Every command below uses the `az` CLI. Run them from a machine with `az`
installed and `az login` already completed.

**Status: PENDING HUMAN VERIFICATION.** This environment has no `az` CLI and
no authenticated Azure session, so none of the commands below have been run
or the resulting resources verified. Nothing in this document should be
treated as evidence that any Azure resource currently exists.

## 1. Fill in your own values

```bash
export RESOURCE_GROUP="gym-app-rg"
export LOCATION="germanywestcentral"
export POSTGRES_SERVER_NAME="gym-app-db"        # must be globally unique
export POSTGRES_ADMIN_USER="gymappadmin"
export POSTGRES_DB_NAME="gymapp"
export APP_SERVICE_PLAN="gym-app-plan"
export WEBAPP_NAME="gym-app"                     # must be globally unique
export APP_INSIGHTS_NAME="gym-app-insights"
export GITHUB_ORG="<your-github-org-or-user>"
export GITHUB_REPO="<your-repo-name>"
```

## 2. Resource group

```bash
az group create --name "$RESOURCE_GROUP" --location "$LOCATION"
```

## 3. Azure Database for PostgreSQL Flexible Server

PostgreSQL 16, Burstable B1ms, 32 GiB, public networking with firewall
rules, TLS required, 7-day PITR (built into automated backups, no extra
flag needed).

```bash
az postgres flexible-server create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$POSTGRES_SERVER_NAME" \
  --location "$LOCATION" \
  --version 16 \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --admin-user "$POSTGRES_ADMIN_USER" \
  --admin-password "$(openssl rand -base64 24)" \
  --public-access None \
  --high-availability Disabled \
  --backup-retention 7

# Allow App Service (and other Azure-hosted resources) to reach the server.
az postgres flexible-server firewall-rule create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$POSTGRES_SERVER_NAME" \
  --rule-name allow-azure-services \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0

# Your own IP, so you can run drizzle-kit migrate / inspect the DB locally.
MY_IP=$(curl -s https://api.ipify.org)
az postgres flexible-server firewall-rule create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$POSTGRES_SERVER_NAME" \
  --rule-name allow-my-ip \
  --start-ip-address "$MY_IP" \
  --end-ip-address "$MY_IP"

az postgres flexible-server db create \
  --resource-group "$RESOURCE_GROUP" \
  --server-name "$POSTGRES_SERVER_NAME" \
  --database-name "$POSTGRES_DB_NAME"
```

**Save the admin password immediately** (the `openssl rand` command above
doesn't print it back) — you need it to build `DATABASE_URL`:

```
postgresql://<admin-user>:<password>@<server-name>.postgres.database.azure.com:5432/<db-name>?sslmode=require
```

CI's per-run firewall rule (see `.github/workflows/deploy.yml`) is created
and torn down automatically on every deploy — nothing to do here for that.

## 4. App Service (Linux, Node 22, Basic B1)

```bash
az appservice plan create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_SERVICE_PLAN" \
  --location "$LOCATION" \
  --is-linux \
  --sku B1

az webapp create \
  --resource-group "$RESOURCE_GROUP" \
  --plan "$APP_SERVICE_PLAN" \
  --name "$WEBAPP_NAME" \
  --runtime "NODE:22-lts"

az webapp config set \
  --resource-group "$RESOURCE_GROUP" \
  --name "$WEBAPP_NAME" \
  --always-on true \
  --startup-file "node server.js"

az webapp update \
  --resource-group "$RESOURCE_GROUP" \
  --name "$WEBAPP_NAME" \
  --https-only true
```

## 5. Application Insights (workspace-based)

```bash
az monitor log-analytics workspace create \
  --resource-group "$RESOURCE_GROUP" \
  --workspace-name "${APP_INSIGHTS_NAME}-workspace" \
  --location "$LOCATION"

WORKSPACE_ID=$(az monitor log-analytics workspace show \
  --resource-group "$RESOURCE_GROUP" \
  --workspace-name "${APP_INSIGHTS_NAME}-workspace" \
  --query id -o tsv)

az monitor app-insights component create \
  --resource-group "$RESOURCE_GROUP" \
  --app "$APP_INSIGHTS_NAME" \
  --location "$LOCATION" \
  --workspace "$WORKSPACE_ID"

APPINSIGHTS_CONNECTION_STRING=$(az monitor app-insights component show \
  --resource-group "$RESOURCE_GROUP" \
  --app "$APP_INSIGHTS_NAME" \
  --query connectionString -o tsv)
```

## 6. App Settings (App Service, not Key Vault — ADR-009)

```bash
DATABASE_URL="postgresql://${POSTGRES_ADMIN_USER}:<password-from-step-3>@${POSTGRES_SERVER_NAME}.postgres.database.azure.com:5432/${POSTGRES_DB_NAME}?sslmode=require"
SESSION_SECRET=$(openssl rand -base64 32)

az webapp config appsettings set \
  --resource-group "$RESOURCE_GROUP" \
  --name "$WEBAPP_NAME" \
  --settings \
    DATABASE_URL="$DATABASE_URL" \
    SESSION_SECRET="$SESSION_SECRET" \
    APPLICATIONINSIGHTS_CONNECTION_STRING="$APPINSIGHTS_CONNECTION_STRING"
```

## 7. GitHub OIDC federation (no long-lived Azure credentials)

```bash
APP_NAME="gym-app-github-oidc"
az ad app create --display-name "$APP_NAME"
APP_ID=$(az ad app list --display-name "$APP_NAME" --query "[0].appId" -o tsv)
az ad sp create --id "$APP_ID"
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)

# Scope the role assignment to the resource group only.
az role assignment create \
  --assignee "$APP_ID" \
  --role Contributor \
  --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP"

# Federated credential: trusts GitHub Actions runs for this repo's `main`
# branch and its `production` environment. Adjust `subject` if your deploy
# workflow uses a different branch or environment name.
az ad app federated-credential create \
  --id "$APP_ID" \
  --parameters '{
    "name": "gym-app-main-branch",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:'"$GITHUB_ORG"'/'"$GITHUB_REPO"':ref:refs/heads/main",
    "audiences": ["api://AzureADTokenExchange"]
  }'

az ad app federated-credential create \
  --id "$APP_ID" \
  --parameters '{
    "name": "gym-app-production-environment",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:'"$GITHUB_ORG"'/'"$GITHUB_REPO"':environment:production",
    "audiences": ["api://AzureADTokenExchange"]
  }'

echo "AZURE_CLIENT_ID=$APP_ID"
echo "AZURE_TENANT_ID=$TENANT_ID"
echo "AZURE_SUBSCRIPTION_ID=$SUBSCRIPTION_ID"
```

If OIDC federation setup is unavailable in your Azure AD tenant, ADR-009's
documented fallback is a classic publish-profile secret
(`az webapp deploy-profile show` → `AZURE_WEBAPP_PUBLISH_PROFILE` secret,
used with `azure/webapps-deploy`'s `publish-profile` input instead of
`azure/login`). Prefer OIDC; only fall back if federation is genuinely
blocked.

## 8. GitHub repository configuration

In the GitHub repo: **Settings → Environments → New environment**, name it
`production` (matches `environment: production` in `deploy.yml`), then add
these as **environment secrets**:

| Secret | Value |
|---|---|
| `AZURE_CLIENT_ID` | from step 7 |
| `AZURE_TENANT_ID` | from step 7 |
| `AZURE_SUBSCRIPTION_ID` | from step 7 |
| `AZURE_RESOURCE_GROUP` | `$RESOURCE_GROUP` |
| `AZURE_POSTGRES_SERVER_NAME` | `$POSTGRES_SERVER_NAME` |
| `AZURE_WEBAPP_NAME` | `$WEBAPP_NAME` |
| `DATABASE_URL` | from step 6 |
| `SESSION_SECRET` | from step 6 |

No `AZURE_CLIENT_SECRET` and no publish profile — the whole point of OIDC
is that GitHub never holds a long-lived Azure credential.

## 9. Verification checklist (PENDING HUMAN VERIFICATION)

- [ ] `az postgres flexible-server show` confirms the server is `Ready`
- [ ] `psql "$DATABASE_URL" -c 'select 1'` connects from your machine
- [ ] `az webapp show` confirms the app is `Running`
- [ ] Pushing to `main` triggers `.github/workflows/deploy.yml` and it goes green
- [ ] `https://$WEBAPP_NAME.azurewebsites.net` serves the setup/login page over HTTPS
- [ ] First-run setup creates the one account and reaches the Today shell
- [ ] Application Insights **Live Metrics** shows traffic after a few requests
