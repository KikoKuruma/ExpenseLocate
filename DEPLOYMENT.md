# ExpenseLocator Deployment Guide

This guide provides comprehensive instructions for deploying ExpenseLocator using Docker containers on Google Cloud Platform.

## Quick Start

### Option 1: Automated GCP Deployment (Recommended)

```bash
# Make scripts executable
chmod +x deploy-gcp.sh install.sh

# Deploy to Google Cloud Platform
./deploy-gcp.sh
```

### Option 2: Manual VM Setup

```bash
# 1. Create a Google Cloud VM
# 2. SSH into the VM
# 3. Run the installation script
curl -sSL https://raw.githubusercontent.com/your-repo/expenselocator/main/install.sh | bash
```

### Option 3: Local Docker Development

```bash
# Copy environment file
cp .env.example .env

# Edit with your configuration
nano .env

# Start with Docker Compose
docker-compose up -d
```

## Prerequisites

### For Google Cloud Deployment

1. **Google Cloud SDK installed:**
   ```bash
   # Install gcloud CLI
   curl https://sdk.cloud.google.com | bash
   exec -l $SHELL
   gcloud init
   ```

2. **Project setup:**
   ```bash
   # Set your project
   gcloud config set project YOUR_PROJECT_ID
   
   # Enable required APIs
   gcloud services enable compute.googleapis.com
   gcloud services enable cloudbuild.googleapis.com
   ```

3. **Authentication configured:**
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```

### For Local Development

1. **Docker and Docker Compose installed**
2. **Node.js 18+ (for local development)**
3. **PostgreSQL (if not using Docker)**

## Configuration

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `REPLIT_CLIENT_ID` | Replit OAuth Client ID | `your-client-id` |
| `REPLIT_CLIENT_SECRET` | Replit OAuth Client Secret | `your-client-secret` |
| `REPLIT_REDIRECT_URI` | OAuth callback URL | `https://your-domain.com/api/auth/callback` |
| `POSTGRES_PASSWORD` | Database password | `securepassword123` |
| `SESSION_SECRET` | Session encryption key | `your-32-char-secret` |
| `ALLOWED_ORIGINS` | Allowed origins | `https://your-domain.com` |

### Optional Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REPLIT_DOMAINS` | Comma-separated list of deployed Replit domains. Required only when using Replit SSO. | _(unset)_ |
| `DEFAULT_ADMIN_ID` | Override the fallback admin user ID when Replit SSO is disabled. | `local-admin` |
| `DEFAULT_ADMIN_EMAIL` | Override the fallback admin email when Replit SSO is disabled. | `admin@example.com` |
| `DEFAULT_ADMIN_FIRST_NAME` | Override the fallback admin first name when Replit SSO is disabled. | `Local` |
| `DEFAULT_ADMIN_LAST_NAME` | Override the fallback admin last name when Replit SSO is disabled. | `Admin` |

### Setting up Replit Authentication

1. Go to [Replit Account Settings](https://replit.com/account/authentication)
2. Click "Create OAuth App"
3. Fill in the details:
   - **App Name:** ExpenseLocator
   - **Description:** Expense management system
   - **Redirect URI:** `https://your-domain.com/api/auth/callback`
4. Copy the Client ID and Secret to your `.env` file

If you do not configure `REPLIT_DOMAINS`, ExpenseLocator will automatically provision a local admin session using the values
above so you can access the application immediately in Docker or other self-hosted environments.

## Deployment Options

### 1. Google Cloud Platform Deployment

#### Automated Deployment

```bash
# Clone the repository
git clone https://github.com/your-repo/expenselocator.git
cd expenselocator

# Run deployment script
./deploy-gcp.sh

# Optional: Set up SSL certificate
./deploy-gcp.sh ssl your-domain.com

# Check deployment status
./deploy-gcp.sh info

# SSH into the VM
./deploy-gcp.sh ssh
```

#### Manual GCP Deployment

```bash
# Create VM instance
gcloud compute instances create expenselocator-vm \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --machine-type=e2-medium \
  --boot-disk-size=20GB \
  --tags=http-server,https-server

# Create firewall rules
gcloud compute firewall-rules create allow-http \
  --allow tcp:80 --source-ranges 0.0.0.0/0 --target-tags http-server

gcloud compute firewall-rules create allow-https \
  --allow tcp:443 --source-ranges 0.0.0.0/0 --target-tags https-server

# Allow direct access to the application port if you're not using the nginx profile
# (adjust 5000 if you've changed APP_PORT)
gcloud compute firewall-rules create allow-app-port \
  --allow tcp:5000 --source-ranges 0.0.0.0/0 --target-tags http-server

# SSH into the instance
gcloud compute ssh expenselocator-vm

# Run installation script
curl -sSL https://raw.githubusercontent.com/your-repo/expenselocator/main/install.sh | bash
```

### 2. Local Docker Development

```bash
# Start development environment
cp .env.example .env
# Edit .env with your settings
docker-compose up -d

# View logs
docker-compose logs -f

# Stop environment
docker-compose down
```

### 3. Traditional Server Deployment

```bash
# Install Node.js and PostgreSQL
# Clone repository
# Install dependencies
npm install

# Build application
npm run build

# Start with PM2 or systemd
npm start
```

## SSL/TLS Configuration

### Using Let's Encrypt (Recommended)

```bash
# On your server
sudo apt install certbot python3-certbot-nginx

# Generate certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal (already configured in install script)
sudo crontab -l | grep certbot
```

### Using Custom Certificates

```bash
# Copy certificates to /opt/expenselocator/ssl/
sudo cp your-cert.pem /opt/expenselocator/ssl/cert.pem
sudo cp your-key.pem /opt/expenselocator/ssl/key.pem

# Enable nginx with SSL
cd /opt/expenselocator
docker-compose --profile nginx up -d
```

## Monitoring and Maintenance

### Health Checks

```bash
# Application health
curl http://your-server/api/health

# Container status
docker-compose ps

# Detailed health check
node health-check.js
```

### Logs

```bash
# Application logs
expenselocator-maintenance logs

# System logs
sudo journalctl -u expenselocator

# Nginx logs (if using)
sudo docker-compose logs nginx
```

### Backups

```bash
# Manual backup
expenselocator-maintenance backup

# Automatic backups are configured via cron
# Located in: /opt/expenselocator/backups/
```

### Updates

```bash
# Update Docker images
expenselocator-maintenance update

# Update system packages
sudo apt update && sudo apt upgrade

# Restart services
expenselocator-maintenance restart
```

## Troubleshooting

### Common Issues

1. **Database connection failed:**
   ```bash
   # Check database status
   docker-compose exec postgres pg_isready -U postgres
   
   # Reset database
   docker-compose down -v
   docker-compose up -d
   ```

2. **Permission denied errors:**
   ```bash
   sudo chown -R expenselocator:expenselocator /opt/expenselocator
   ```

3. **Application port already in use:**
   ```bash
   # Check what's using the application port (default: 5000)
   sudo netstat -tulpn | grep :5000

   # Stop the conflicting service or change APP_PORT in .env
   sudo systemctl stop apache2  # or nginx
   ```

4. **SSL certificate issues:**
   ```bash
   # Renew certificate
   sudo certbot renew
   
   # Check certificate status
   sudo certbot certificates
   ```

### Performance Optimization

1. **Increase resource limits:**
   ```yaml
   # In docker-compose.yml
   services:
     app:
       deploy:
         resources:
           limits:
             memory: 1G
             cpus: '0.5'
   ```

2. **Database optimization:**
   ```yaml
   services:
     postgres:
       environment:
         POSTGRES_SHARED_BUFFERS: 256MB
         POSTGRES_MAX_CONNECTIONS: 100
   ```

3. **Nginx caching:**
   ```nginx
   # In nginx.conf
   location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
       expires 1y;
       add_header Cache-Control "public, immutable";
   }
   ```

## Security Considerations

### Essential Security Measures

1. **Firewall configuration:**
   ```bash
   sudo ufw enable
   sudo ufw allow ssh
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   ```

2. **Fail2ban protection:**
   ```bash
   sudo systemctl enable fail2ban
   sudo systemctl start fail2ban
   ```

3. **Strong passwords:**
   - Change default `POSTGRES_PASSWORD`
   - Use 32+ character `SESSION_SECRET`
   - Enable 2FA for GCP account

4. **Regular updates:**
   ```bash
   # Monthly security updates
   sudo apt update && sudo apt upgrade
   expenselocator-maintenance update
   ```

### Advanced Security

1. **Network security groups (GCP):**
   ```bash
   # Restrict SSH access to specific IPs
   gcloud compute firewall-rules create ssh-restricted \
     --allow tcp:22 --source-ranges YOUR_IP/32
   ```

2. **Database security:**
   ```bash
   # Use read-only database user for reporting
   # Encrypt database connections
   # Regular database backups
   ```

3. **Application security:**
   ```bash
   # Use environment-specific secrets
   # Implement rate limiting
   # Enable HTTPS-only cookies
   ```

## Scaling Considerations

### Horizontal Scaling

1. **Load balancer setup:**
   ```bash
   # GCP Load Balancer
   gcloud compute target-pools create expenselocator-pool
   gcloud compute forwarding-rules create expenselocator-lb
   ```

2. **Database clustering:**
   ```bash
   # PostgreSQL read replicas
   # Connection pooling with PgBouncer
   ```

3. **Session storage:**
   ```bash
   # Redis for session storage
   # Shared file storage for uploads
   ```

### Vertical Scaling

```bash
# Increase VM size
gcloud compute instances set-machine-type expenselocator-vm \
  --machine-type=e2-standard-2 --zone=us-central1-a

# Increase disk size
gcloud compute disks resize expenselocator-vm \
  --size=50GB --zone=us-central1-a
```

## Support and Maintenance

### Regular Maintenance Tasks

1. **Weekly:**
   - Check application logs
   - Verify backup integrity
   - Monitor disk space

2. **Monthly:**
   - Update system packages
   - Update Docker images
   - Review security logs

3. **Quarterly:**
   - Review performance metrics
   - Update SSL certificates
   - Security audit

### Getting Help

1. **Check logs first:**
   ```bash
   expenselocator-maintenance logs
   ```

2. **Verify configuration:**
   ```bash
   cat /opt/expenselocator/.env
   ```

3. **Test connectivity:**
   ```bash
   curl http://localhost/api/health
   ```

4. **System status:**
   ```bash
   expenselocator-maintenance status
   ```

This deployment guide provides comprehensive instructions for deploying ExpenseLocator in production environments with proper security, monitoring, and maintenance procedures.