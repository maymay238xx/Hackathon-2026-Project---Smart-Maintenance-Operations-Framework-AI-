
# L'Avenir Smart Maintenance — Azure Deploy Script

# What this does:
#   1. Creates a Resource Group
#   2. Creates Azure Container Registry (ACR)
#   3. Builds the Docker image in ACR (no local Docker needed)
#   4. Creates a Container Apps environment
#   5. Deploys with all .env secrets injected
#   6. Prints the live URL

# Prerequisites:
#   az login  (Azure CLI installed and authenticated)
#   .env file in the same directory as this script
#   manuals/ folder present (run python download_pdfs.py first)


set -euo pipefail

# CONFIG 
RESOURCE_GROUP="lavenir-rg"
LOCATION="uksouth"
ACR_NAME="laveniracr$(openssl rand -hex 4)"   
APP_ENV="lavenir-env"
APP_NAME="lavenir-app"
IMAGE_NAME="lavenir"
TAG="latest"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

echo -e "${BLUE}"
echo "  ██╗      █████╗ ██╗   ██╗███████╗███╗   ██╗██╗██████╗ "
echo "  ██║     ██╔══██╗██║   ██║██╔════╝████╗  ██║██║██╔══██╗"
echo "  ██║     ███████║██║   ██║█████╗  ██╔██╗ ██║██║██████╔╝"
echo "  ██║     ██╔══██║╚██╗ ██╔╝██╔══╝  ██║╚██╗██║██║██╔══██╗"
echo "  ███████╗██║  ██║ ╚████╔╝ ███████╗██║ ╚████║██║██║  ██║"
echo "  ╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝"
echo -e "  Smart Operating Framework — Deploying to Azure${NC}"
echo ""

# Pre-flight checks 
if ! command -v az &>/dev/null; then
  echo -e "${RED}✗ Azure CLI not found. Install: https://aka.ms/installazurecli${NC}"; exit 1
fi
if [ ! -f .env ]; then
  echo -e "${RED}✗ .env file not found. Make sure you are in the project root.${NC}"; exit 1
fi
if [ ! -f Dockerfile ]; then
  echo -e "${RED}✗ Dockerfile not found. Make sure you are in the project root.${NC}"; exit 1
fi
if [ ! -d triage-dashboard ]; then
  echo -e "${RED}✗ triage-dashboard/ folder not found. Make sure you are in the project root.${NC}"; exit 1
fi
if [ ! -d manuals ]; then
  echo -e "${YELLOW}⚠  manuals/ folder not found. Run: python download_pdfs.py first${NC}"
  echo -e "${YELLOW}   Continuing anyway — RAG agent will have no PDFs loaded.${NC}"
  mkdir -p manuals
fi

echo -e "${YELLOW}Checking Azure login...${NC}"
az account show --output none 2>/dev/null || { echo -e "${RED}✗ Not logged in. Run: az login${NC}"; exit 1; }
SUBSCRIPTION=$(az account show --query name -o tsv)
echo -e "${GREEN}✓ Logged in — Subscription: $SUBSCRIPTION${NC}"

# Step 1 — Resource Group 
echo -e "${YELLOW}Loading .env variables...${NC}"
set -a; source .env; set +a
echo -e "${GREEN}✓ Environment loaded${NC}"

echo -e "\n${YELLOW}[1/5] Creating Resource Group: $RESOURCE_GROUP in $LOCATION...${NC}"
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none
echo -e "${GREEN}✓ Resource Group ready${NC}"

# Step 2 — Container Registry 
echo -e "\n${YELLOW}[2/5] Creating Container Registry: $ACR_NAME...${NC}"
az acr create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$ACR_NAME" \
  --sku Basic \
  --admin-enabled true \
  --output none

ACR_SERVER="$ACR_NAME.azurecr.io"
ACR_USER=$(az acr credential show --name "$ACR_NAME" --query username -o tsv)
ACR_PASS=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)
echo -e "${GREEN}✓ ACR ready: $ACR_SERVER${NC}"

# Step 3 — Build Docker image in ACR (no local Docker needed) 
echo -e "\n${YELLOW}[3/5] Building Docker image in ACR...${NC}"
echo "     This builds React frontend + FastAPI backend into one image."
echo "     Takes 4-6 minutes. Go make a coffee ☕"
az acr build \
  --registry "$ACR_NAME" \
  --image "$IMAGE_NAME:$TAG" \
  --platform linux/amd64 \
  .
echo -e "${GREEN}✓ Image built: $ACR_SERVER/$IMAGE_NAME:$TAG${NC}"

#  Step 4 — Container Apps Environment 
echo -e "\n${YELLOW}[4/5] Creating Container Apps environment...${NC}"
az containerapp env create \
  --name "$APP_ENV" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none
echo -e "${GREEN}✓ Environment ready: $APP_ENV${NC}"

#  Step 5 — Deploy
echo -e "\n${YELLOW}[5/5] Deploying container app...${NC}"

# Build env var arguments from .env file
ENV_ARGS=""
while IFS= read -r line || [ -n "$line" ]; do
  # Skip comments and blank lines
  [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue
  key="${line%%=*}"
  val="${line#*=}"
  # Strip surrounding quotes
  val="${val%\"}" ; val="${val#\"}"
  val="${val%\'}" ; val="${val#\'}"
  # Skip empty values (e.g. AGENT2_CLIENT_ID=)
  [ -z "$val" ] && continue
  ENV_ARGS="$ENV_ARGS $key=$val"
done < .env

az containerapp create \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$APP_ENV" \
  --image "$ACR_SERVER/$IMAGE_NAME:$TAG" \
  --registry-server "$ACR_SERVER" \
  --registry-username "$ACR_USER" \
  --registry-password "$ACR_PASS" \
  --target-port 8000 \
  --ingress external \
  --min-replicas 0 \
  --max-replicas 3 \
  --cpu 1.0 \
  --memory 2.0Gi \
  --env-vars \
    AZURE_OPENAI_ENDPOINT="$AZURE_OPENAI_ENDPOINT" \
    AZURE_OPENAI_API_KEY="$AZURE_OPENAI_API_KEY" \
    AZURE_OPENAI_DEPLOYMENT_NAME="$AZURE_OPENAI_DEPLOYMENT_NAME" \
    AZURE_OPENAI_API_VERSION="$AZURE_OPENAI_API_VERSION" \
    FABRIC_SQL_ENDPOINT="$FABRIC_SQL_ENDPOINT" \
    FABRIC_DATABASE="$FABRIC_DATABASE" \
    FABRIC_WORKSPACE_ID="$FABRIC_WORKSPACE_ID" \
    FABRIC_TENANT_ID="$FABRIC_TENANT_ID" \
    FABRIC_CLIENT_ID="$FABRIC_CLIENT_ID" \
    FABRIC_CLIENT_SECRET="$FABRIC_CLIENT_SECRET" \
    FABRIC_LAKEHOUSE_ID="$FABRIC_LAKEHOUSE_ID" \
    ENTRA_TENANT_ID="$ENTRA_TENANT_ID" \
    ENTRA_CLIENT_ID="$ENTRA_CLIENT_ID" \
    ENTRA_AUDIENCE="$ENTRA_AUDIENCE" \
    VITE_ENTRA_CLIENT_ID="$VITE_ENTRA_CLIENT_ID" \
    VITE_ENTRA_TENANT_ID="$VITE_ENTRA_TENANT_ID" \
    VITE_ENTRA_SCOPE="$VITE_ENTRA_SCOPE" \
    AGENT1_CLIENT_ID="$AGENT1_CLIENT_ID" \
    AGENT1_CLIENT_SECRET="$AGENT1_CLIENT_SECRET" \
    DEV_AUTH_BYPASS="$DEV_AUTH_BYPASS" \
    DEV_USER_ROLE="$DEV_USER_ROLE" \
    DEV_USER_NAME="$DEV_USER_NAME" \
    DEV_USER_EMAIL="$DEV_USER_EMAIL" \
    DEV_USER_ID="$DEV_USER_ID" \
  --output none

# Get live URL
LIVE_URL=$(az containerapp show \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "properties.configuration.ingress.fqdn" -o tsv)

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✓  DEPLOYMENT COMPLETE${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  🌐 Live URL    : ${GREEN}https://$LIVE_URL${NC}"
echo -e "  🔍 Health      : ${GREEN}https://$LIVE_URL/health${NC}"
echo -e "  📦 Image       : $ACR_SERVER/$IMAGE_NAME:$TAG"
echo -e "  📁 Resource    : $RESOURCE_GROUP ($LOCATION)"
echo ""
echo -e "${YELLOW}  ⚠  Add this URL to your lavenir-frontend redirect URIs:${NC}"
echo -e "     portal.azure.com → App registrations → lavenir-frontend"
echo -e "     → Authentication → Add URI → https://$LIVE_URL"
echo ""
echo -e "${YELLOW}  To redeploy after code changes:${NC}"
echo -e "     az acr build --registry $ACR_NAME --image $IMAGE_NAME:$TAG --platform linux/amd64 ."
echo -e "     az containerapp update --name $APP_NAME --resource-group $RESOURCE_GROUP --image $ACR_SERVER/$IMAGE_NAME:$TAG"
echo ""
echo -e "${YELLOW}  To tear everything down:${NC}"
echo -e "     az group delete --name $RESOURCE_GROUP --yes --no-wait"
echo ""

echo "https://$LIVE_URL" > .deployed_url
echo -e "${GREEN}  URL saved to .deployed_url${NC}"