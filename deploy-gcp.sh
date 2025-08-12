#!/bin/bash

# ExpenseLocator Google Cloud Platform Deployment Script
# This script automates the deployment of ExpenseLocator to a GCP VM

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# Configuration
PROJECT_ID=""
INSTANCE_NAME="expenselocator-vm"
ZONE="us-central1-a"
MACHINE_TYPE="e2-medium"
DISK_SIZE="20GB"
IMAGE_FAMILY="ubuntu-2204-lts"
IMAGE_PROJECT="ubuntu-os-cloud"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    error "Google Cloud SDK is not installed. Please install it first: https://cloud.google.com/sdk/docs/install"
fi

# Get project ID if not set
if [ -z "$PROJECT_ID" ]; then
    PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
    if [ -z "$PROJECT_ID" ]; then
        error "No GCP project set. Run: gcloud config set project YOUR_PROJECT_ID"
    fi
fi

log "Using GCP Project: $PROJECT_ID"

# Function to create VM instance
create_vm() {
    log "Creating VM instance: $INSTANCE_NAME"
    
    gcloud compute instances create $INSTANCE_NAME \
        --project=$PROJECT_ID \
        --zone=$ZONE \
        --machine-type=$MACHINE_TYPE \
        --network-interface=network-tier=PREMIUM,stack-type=IPV4_ONLY,subnet=default \
        --metadata-from-file startup-script=startup-script.sh \
        --maintenance-policy=MIGRATE \
        --provisioning-model=STANDARD \
        --service-account=$(gcloud iam service-accounts list --format="value(email)" --filter="displayName:'Compute Engine default service account'") \
        --scopes=https://www.googleapis.com/auth/devstorage.read_only,https://www.googleapis.com/auth/logging.write,https://www.googleapis.com/auth/monitoring.write,https://www.googleapis.com/auth/servicecontrol,https://www.googleapis.com/auth/service.management.readonly,https://www.googleapis.com/auth/trace.append \
        --tags=http-server,https-server \
        --create-disk=auto-delete=yes,boot=yes,device-name=$INSTANCE_NAME,image=projects/$IMAGE_PROJECT/global/images/family/$IMAGE_FAMILY,mode=rw,size=$DISK_SIZE,type=projects/$PROJECT_ID/zones/$ZONE/diskTypes/pd-standard \
        --no-shielded-secure-boot \
        --shielded-vtpm \
        --shielded-integrity-monitoring \
        --labels=app=expenselocator,environment=production \
        --reservation-affinity=any
}

# Function to create firewall rules
create_firewall_rules() {
    log "Creating firewall rules..."
    
    # HTTP traffic
    if ! gcloud compute firewall-rules describe default-allow-http --project=$PROJECT_ID &>/dev/null; then
        gcloud compute firewall-rules create default-allow-http \
            --project=$PROJECT_ID \
            --direction=INGRESS \
            --priority=1000 \
            --network=default \
            --action=ALLOW \
            --rules=tcp:80 \
            --source-ranges=0.0.0.0/0 \
            --target-tags=http-server
    fi
    
    # HTTPS traffic
    if ! gcloud compute firewall-rules describe default-allow-https --project=$PROJECT_ID &>/dev/null; then
        gcloud compute firewall-rules create default-allow-https \
            --project=$PROJECT_ID \
            --direction=INGRESS \
            --priority=1000 \
            --network=default \
            --action=ALLOW \
            --rules=tcp:443 \
            --source-ranges=0.0.0.0/0 \
            --target-tags=https-server
    fi
}

# Function to create startup script
create_startup_script() {
    log "Creating startup script..."
    
    cat > startup-script.sh << 'EOF'
#!/bin/bash

# VM startup script for ExpenseLocator
exec > >(tee /var/log/startup-script.log) 2>&1

echo "Starting ExpenseLocator setup..."

# Update system
apt-get update
apt-get upgrade -y

# Install required packages
apt-get install -y curl wget git unzip

# Create expenselocator user
useradd -m -s /bin/bash expenselocator
usermod -aG sudo expenselocator

# Download and run installation script
su - expenselocator -c "curl -sSL https://raw.githubusercontent.com/your-repo/expenselocator/main/install.sh | bash"

echo "ExpenseLocator setup completed!"
EOF
}

# Function to get VM information
get_vm_info() {
    log "Getting VM information..."
    
    EXTERNAL_IP=$(gcloud compute instances describe $INSTANCE_NAME --zone=$ZONE --format="get(networkInterfaces[0].accessConfigs[0].natIP)")
    INTERNAL_IP=$(gcloud compute instances describe $INSTANCE_NAME --zone=$ZONE --format="get(networkInterfaces[0].networkIP)")
    
    echo ""
    log "VM Details:"
    echo "  Instance Name: $INSTANCE_NAME"
    echo "  Zone: $ZONE"
    echo "  External IP: $EXTERNAL_IP"
    echo "  Internal IP: $INTERNAL_IP"
    echo "  SSH Command: gcloud compute ssh $INSTANCE_NAME --zone=$ZONE"
    echo "  Application URL: http://$EXTERNAL_IP"
    echo ""
}

# Function to upload application files
upload_files() {
    log "Uploading application files to VM..."
    
    # Wait for VM to be ready
    log "Waiting for VM to be ready..."
    sleep 60
    
    # Upload files
    gcloud compute scp --zone=$ZONE --recurse \
        Dockerfile docker-compose.yml .env.example nginx.conf init-db.sql install.sh README-Docker.md \
        $INSTANCE_NAME:/tmp/
    
    # Move files and set permissions
    gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --command="
        sudo mkdir -p /opt/expenselocator
        sudo mv /tmp/{Dockerfile,docker-compose.yml,.env.example,nginx.conf,init-db.sql,README-Docker.md} /opt/expenselocator/
        sudo chmod +x /tmp/install.sh
        sudo mv /tmp/install.sh /opt/expenselocator/
        sudo chown -R expenselocator:expenselocator /opt/expenselocator
    "
}

# Function to setup SSL certificate (Let's Encrypt)
setup_ssl() {
    local domain=$1
    if [ -n "$domain" ]; then
        log "Setting up SSL certificate for domain: $domain"
        
        gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --command="
            sudo apt install -y certbot python3-certbot-nginx
            sudo certbot --nginx -d $domain --non-interactive --agree-tos --email admin@$domain
        "
    else
        warn "No domain provided, skipping SSL setup"
    fi
}

# Main deployment function
deploy() {
    log "Starting ExpenseLocator deployment to Google Cloud Platform"
    
    # Check if instance already exists
    if gcloud compute instances describe $INSTANCE_NAME --zone=$ZONE &>/dev/null; then
        warn "VM instance $INSTANCE_NAME already exists"
        read -p "Do you want to delete and recreate it? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            log "Deleting existing instance..."
            gcloud compute instances delete $INSTANCE_NAME --zone=$ZONE --quiet
        else
            log "Using existing instance"
        fi
    fi
    
    # Create firewall rules
    create_firewall_rules
    
    # Create startup script
    create_startup_script
    
    # Create VM if it doesn't exist
    if ! gcloud compute instances describe $INSTANCE_NAME --zone=$ZONE &>/dev/null; then
        create_vm
    fi
    
    # Upload application files
    upload_files
    
    # Get VM information
    get_vm_info
    
    log "Deployment completed successfully!"
    log ""
    log "Next steps:"
    log "1. SSH into the VM: gcloud compute ssh $INSTANCE_NAME --zone=$ZONE"
    log "2. Configure environment: sudo nano /opt/expenselocator/.env"
    log "3. Start the application: sudo systemctl start expenselocator"
    log ""
    log "Optional: Set up SSL with your domain:"
    log "  ./deploy-gcp.sh ssl your-domain.com"
}

# Parse command line arguments
case "$1" in
    "ssl")
        if [ -z "$2" ]; then
            error "Please provide a domain name for SSL setup"
        fi
        setup_ssl "$2"
        ;;
    "info")
        get_vm_info
        ;;
    "ssh")
        gcloud compute ssh $INSTANCE_NAME --zone=$ZONE
        ;;
    "delete")
        log "Deleting VM instance: $INSTANCE_NAME"
        gcloud compute instances delete $INSTANCE_NAME --zone=$ZONE
        ;;
    "")
        deploy
        ;;
    *)
        echo "Usage: $0 [ssl domain.com|info|ssh|delete]"
        echo ""
        echo "Commands:"
        echo "  (no args)  - Deploy ExpenseLocator to GCP"
        echo "  ssl        - Setup SSL certificate for domain"
        echo "  info       - Show VM information"
        echo "  ssh        - SSH into the VM"
        echo "  delete     - Delete the VM instance"
        exit 1
        ;;
esac