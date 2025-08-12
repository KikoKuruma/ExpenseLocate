#!/bin/bash

# ExpenseLocator Google Cloud VM Installation Script
# This script sets up ExpenseLocator on a Google Cloud VM with Docker

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
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

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   error "This script should not be run as root. Please run as a regular user with sudo privileges."
fi

# Check if we're on a supported OS
if ! command -v apt-get &> /dev/null; then
    error "This script requires Ubuntu/Debian. Other distributions are not currently supported."
fi

log "Starting ExpenseLocator installation on Google Cloud VM..."

# Update system packages
log "Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install required system packages
log "Installing required system packages..."
sudo apt-get install -y \
    curl \
    wget \
    git \
    unzip \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    ufw \
    fail2ban

# Install Docker
if ! command -v docker &> /dev/null; then
    log "Installing Docker..."
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io
    
    # Add current user to docker group
    sudo usermod -aG docker $USER
    log "Docker installed successfully. You may need to log out and back in for group changes to take effect."
else
    log "Docker is already installed."
fi

# Install Docker Compose
if ! command -v docker-compose &> /dev/null; then
    log "Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    log "Docker Compose installed successfully."
else
    log "Docker Compose is already installed."
fi

# Create application directory
APP_DIR="/opt/expenselocator"
log "Creating application directory: $APP_DIR"
sudo mkdir -p $APP_DIR
sudo chown $USER:$USER $APP_DIR

# Download application files (if not already present)
if [ ! -f "$APP_DIR/docker-compose.yml" ]; then
    log "Setting up application files..."
    
    # Create necessary directories
    mkdir -p $APP_DIR/{uploads,ssl,backups}
    
    # Copy configuration files
    cp docker-compose.yml $APP_DIR/
    cp Dockerfile $APP_DIR/
    cp .env.example $APP_DIR/.env
    cp nginx.conf $APP_DIR/ 2>/dev/null || true
    cp init-db.sql $APP_DIR/ 2>/dev/null || true
    
    log "Application files copied to $APP_DIR"
else
    log "Application files already exist in $APP_DIR"
fi

# Configure firewall
log "Configuring firewall..."
sudo ufw --force enable
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 5432/tcp  # PostgreSQL (if needed for external access)

# Configure fail2ban
log "Configuring fail2ban..."
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Set up environment file
log "Setting up environment configuration..."
cd $APP_DIR

if [ ! -f .env ]; then
    cp .env.example .env
    
    # Generate a secure session secret
    SESSION_SECRET=$(openssl rand -base64 32)
    sed -i "s/your-super-secret-session-key-change-this-in-production-min-32-chars/$SESSION_SECRET/" .env
    
    warn "Please edit $APP_DIR/.env with your actual configuration values:"
    warn "  - REPLIT_CLIENT_ID, REPLIT_CLIENT_SECRET, REPLIT_REDIRECT_URI"
    warn "  - POSTGRES_PASSWORD (change from default)"
    warn "  - ALLOWED_ORIGINS (your domain)"
fi

# Create systemd service for auto-start
log "Creating systemd service..."
sudo tee /etc/systemd/system/expenselocator.service > /dev/null <<EOF
[Unit]
Description=ExpenseLocator Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$APP_DIR
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable expenselocator

# Create backup script
log "Creating backup script..."
sudo tee /usr/local/bin/expenselocator-backup > /dev/null <<'EOF'
#!/bin/bash

# ExpenseLocator Backup Script
BACKUP_DIR="/opt/expenselocator/backups"
DATE=$(date +%Y%m%d_%H%M%S)
APP_DIR="/opt/expenselocator"

mkdir -p $BACKUP_DIR

# Backup database
cd $APP_DIR
docker-compose exec -T postgres pg_dump -U postgres expenselocator | gzip > $BACKUP_DIR/database_$DATE.sql.gz

# Backup uploads
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz -C $APP_DIR uploads

# Backup environment and configuration
cp $APP_DIR/.env $BACKUP_DIR/env_$DATE.backup

# Keep only last 7 days of backups
find $BACKUP_DIR -name "*.gz" -o -name "*.backup" -mtime +7 -delete

echo "Backup completed: $DATE"
EOF

sudo chmod +x /usr/local/bin/expenselocator-backup

# Create daily backup cron job
echo "0 2 * * * /usr/local/bin/expenselocator-backup" | sudo crontab -

# Create maintenance script
log "Creating maintenance script..."
sudo tee /usr/local/bin/expenselocator-maintenance > /dev/null <<'EOF'
#!/bin/bash

# ExpenseLocator Maintenance Script
APP_DIR="/opt/expenselocator"

case "$1" in
    start)
        cd $APP_DIR && docker-compose up -d
        ;;
    stop)
        cd $APP_DIR && docker-compose down
        ;;
    restart)
        cd $APP_DIR && docker-compose restart
        ;;
    logs)
        cd $APP_DIR && docker-compose logs -f
        ;;
    update)
        cd $APP_DIR && docker-compose pull && docker-compose up -d
        ;;
    backup)
        /usr/local/bin/expenselocator-backup
        ;;
    status)
        cd $APP_DIR && docker-compose ps
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|logs|update|backup|status}"
        exit 1
        ;;
esac
EOF

sudo chmod +x /usr/local/bin/expenselocator-maintenance

log "Installation completed successfully!"
log ""
log "Next steps:"
log "1. Edit $APP_DIR/.env with your configuration"
log "2. Configure your Replit Auth credentials"
log "3. Start the application: sudo systemctl start expenselocator"
log ""
log "Useful commands:"
log "  - Start: expenselocator-maintenance start"
log "  - Stop: expenselocator-maintenance stop"
log "  - Logs: expenselocator-maintenance logs"
log "  - Status: expenselocator-maintenance status"
log "  - Backup: expenselocator-maintenance backup"
log ""
log "The application will be available at: http://your-vm-ip"
warn "Remember to configure your firewall and SSL certificates for production use!"