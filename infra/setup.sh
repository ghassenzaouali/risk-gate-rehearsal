#!/usr/bin/env bash
# One-time setup of the Azure resources and of the GitHub -> Azure trust (OIDC).
# Run from Git Bash after "az login" (with MFA) and "gh auth login".
set -euo pipefail
# Stop Git Bash from turning "/subscriptions/..." into a Windows path
export MSYS_NO_PATHCONV=1

# Names and settings (change IMAGE and GITHUB_REPO for another repository)
RESOURCE_GROUP="rg-risk-gate"
LOCATION="swedencentral"
ENVIRONMENT="env-risk-gate"
APP="risk-gate"
IDENTITY="id-risk-gate-github"
IMAGE="ghcr.io/ghassenzaouali/risk-gate-rehearsal:ca2f6fac03770ecb9fc583366a8d91d794399794"
GITHUB_REPO="ghassenzaouali/risk-gate-rehearsal"

# 1. Enable the services we use, then create the resource group and the environment (Consumption)
for provider in Microsoft.App Microsoft.OperationalInsights Microsoft.ManagedIdentity; do
  az provider register --namespace "$provider" --wait
done
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none
az containerapp env create --name "$ENVIRONMENT" --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" --output none

# 2. The app: public HTTPS, 0.25 vCPU, 0 to 5 replicas, about 10 concurrent requests per replica
az containerapp create --name "$APP" --resource-group "$RESOURCE_GROUP" --environment "$ENVIRONMENT" \
  --image "$IMAGE" --ingress external --target-port 3000 --cpu 0.25 --memory 0.5Gi \
  --min-replicas 0 --max-replicas 5 --scale-rule-name http-rule \
  --scale-rule-type http --scale-rule-http-concurrency 10 --output none

# 3. OIDC: an identity for GitHub Actions, trusted only for pushes on our main branch
az identity create --name "$IDENTITY" --resource-group "$RESOURCE_GROUP" --output none
az identity federated-credential create --name github-main --identity-name "$IDENTITY" \
  --resource-group "$RESOURCE_GROUP" --issuer "https://token.actions.githubusercontent.com" \
  --subject "repo:$GITHUB_REPO:ref:refs/heads/main" --audiences "api://AzureADTokenExchange" --output none

# The identity may manage this resource group only (Contributor role)
PRINCIPAL_ID=$(az identity show --name "$IDENTITY" --resource-group "$RESOURCE_GROUP" --query principalId --output tsv)
GROUP_ID=$(az group show --name "$RESOURCE_GROUP" --query id --output tsv)
az role assignment create --assignee-object-id "$PRINCIPAL_ID" --assignee-principal-type ServicePrincipal \
  --role Contributor --scope "$GROUP_ID" --output none

# 4. Give the pipeline the three ids it needs (identifiers, not secrets)
CLIENT_ID=$(az identity show --name "$IDENTITY" --resource-group "$RESOURCE_GROUP" --query clientId --output tsv)
TENANT_ID=$(az account show --query tenantId --output tsv)
SUBSCRIPTION_ID=$(az account show --query id --output tsv)
gh variable set AZURE_CLIENT_ID --body "$CLIENT_ID" --repo "$GITHUB_REPO"
gh variable set AZURE_TENANT_ID --body "$TENANT_ID" --repo "$GITHUB_REPO"
gh variable set AZURE_SUBSCRIPTION_ID --body "$SUBSCRIPTION_ID" --repo "$GITHUB_REPO"

# 5. Show the public URL of the app
FQDN=$(az containerapp show --name "$APP" --resource-group "$RESOURCE_GROUP" \
  --query properties.configuration.ingress.fqdn --output tsv)
echo "Public URL: https://$FQDN"
