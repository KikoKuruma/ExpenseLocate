#!/bin/bash

# ExpenseLocator Quick Deploy Script
# One-command deployment for Google Cloud Platform

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')] $1${NC}"; }
warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARNING: $1${NC}"; }
error() { echo -e "${RED}[$(date +'%H:%M:%S')] ERROR: $1${NC}"; exit 1; }

# Check prerequisites
log "Checking prerequisites..."

if ! command -v gcloud &> /dev/null; then
    error "Google Cloud SDK not found. Install from: https://cloud.google.com/sdk/docs/install"
fi

if ! command -v docker &> /dev/null; then
    warn "Docker not found locally. Will install on VM."
fi

PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
    error "No GCP project set. Run: gcloud config set project YOUR_PROJECT_ID"
fi

log "Using GCP Project: $PROJECT_ID"

# Configuration
INSTANCE_NAME="${1:-expenselocator-vm}"
ZONE="${2:-us-central1-a}"
DOMAIN="${3:-}"

log "Deploying ExpenseLocator to: $INSTANCE_NAME in $ZONE"

# Create firewall rules if they don't exist
log "Setting up firewall rules..."
gcloud compute firewall-rules describe default-allow-http --project=$PROJECT_ID &>/dev/null || \
    gcloud compute firewall-rules create default-allow-http \
        --allow tcp:80 --source-ranges 0.0.0.0/0 --target-tags http-server --quiet

gcloud compute firewall-rules describe default-allow-https --project=$PROJECT_ID &>/dev/null || \
    gcloud compute firewall-rules create default-allow-https \
        --allow tcp:443 --source-ranges 0.0.0.0/0 --target-tags https-server --quiet

# Create VM if it doesn't exist
if ! gcloud compute instances describe $INSTANCE_NAME --zone=$ZONE &>/dev/null; then
    log "Creating VM instance..."
    gcloud compute instances create $INSTANCE_NAME \
        --zone=$ZONE \
        --machine-type=e2-medium \
        --boot-disk-size=20GB \
        --image-family=ubuntu-2204-lts \
        --image-project=ubuntu-os-cloud \
        --tags=http-server,https-server \
        --metadata startup-script='#!/bin/bash
            apt-get update
            apt-get install -y curl git
            useradd -m -G sudo expenselocator
            echo "expenselocator ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers' \
        --quiet
    
    log "Waiting for VM to start..."
    sleep 60
else
    log "Using existing VM instance: $INSTANCE_NAME"
fi

# Get VM IP
EXTERNAL_IP=$(gcloud compute instances describe $INSTANCE_NAME --zone=$ZONE --format="get(networkInterfaces[0].accessConfigs[0].natIP)")

# Upload files and run installation
log "Uploading application files..."
gcloud compute scp --zone=$ZONE \
    install.sh Dockerfile docker-compose.yml .env.example nginx.conf init-db.sql \
    $INSTANCE_NAME:/tmp/ --quiet

log "Running installation script..."
gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --command="
    chmod +x /tmp/install.sh
    sudo /tmp/install.sh
" --quiet

# Configure environment
log "Setting up environment configuration..."
gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --command="
    cd /opt/expenselocator
    if [ ! -f .env ]; then
        sudo cp .env.example .env
        sudo chown expenselocator:expenselocator .env
    fi
" --quiet

# Set up SSL if domain provided
if [ -n "$DOMAIN" ]; then
    log "Setting up SSL certificate for: $DOMAIN"
    gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --command="
        sudo apt install -y certbot python3-certbot-nginx
        sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN
        cd /opt/expenselocator
        sudo docker-compose --profile nginx up -d
    " --quiet
fi

# Start the application
log "Starting ExpenseLocator..."
gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --command="
    sudo systemctl start expenselocator
    sudo systemctl enable expenselocator
" --quiet

# Show results
log "Deployment completed successfully!"
echo ""
echo "🚀 ExpenseLocator is now running!"
echo ""
echo "📍 VM Details:"
echo "   Instance: $INSTANCE_NAME"
echo "   Zone: $ZONE"
echo "   External IP: $EXTERNAL_IP"
echo ""
echo "🌐 Access URLs:"
if [ -n "$DOMAIN" ]; then
    echo "   Application: https://$DOMAIN"
    echo "   HTTP redirect: http://$DOMAIN"
else
    echo "   Application: http://$EXTERNAL_IP"
fi
echo ""
echo "🔧 Next Steps:"
echo "   1. Configure your application:"
echo "      gcloud compute ssh $INSTANCE_NAME --zone=$ZONE"
echo "      sudo nano /opt/expenselocator/.env"
echo ""
echo "   2. Set up Replit OAuth:"
echo "      - Go to: https://replit.com/account/authentication"
echo "      - Create OAuth app with redirect: https://${DOMAIN:-$EXTERNAL_IP}/api/auth/callback"
echo "      - Add credentials to .env file"
echo ""
echo "   3. Restart after configuration:"
echo "      sudo systemctl restart expenselocator"
echo ""
echo "📋 Useful Commands:"
echo "   SSH: gcloud compute ssh $INSTANCE_NAME --zone=$ZONE"
echo "   Logs: expenselocator-maintenance logs"
echo "   Status: expenselocator-maintenance status"
echo "   Backup: expenselocator-maintenance backup"
echo ""
warn "Remember to configure your .env file with actual Replit OAuth credentials!"

# Optional: Open SSH connection
read -p "Would you like to SSH into the VM now to configure the application? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    gcloud compute ssh $INSTANCE_NAME --zone=$ZONE
fi