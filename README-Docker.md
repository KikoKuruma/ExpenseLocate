# ExpenseLocator Docker Deployment Guide

This guide provides instructions for deploying ExpenseLocator in a Docker container environment, specifically optimized for Google Cloud VMs.

## Quick Start

### Automated Installation (Recommended)

1. **Download and run the installation script:**
   ```bash
   curl -sSL https://raw.githubusercontent.com/your-repo/expenselocator/main/install.sh | bash
   ```

2. **Configure your environment:**
   ```bash
   sudo nano /opt/expenselocator/.env
   ```
   Update the following required values:
   - `REPLIT_CLIENT_ID`
   - `REPLIT_CLIENT_SECRET` 
   - `REPLIT_REDIRECT_URI`
   - `POSTGRES_PASSWORD`
   - `ALLOWED_ORIGINS`

3. **Start the application:**
   ```bash
   sudo systemctl start expenselocator
   ```

### Manual Installation

1. **Prerequisites:**
   ```bash
   # Update system
   sudo apt update && sudo apt upgrade -y
   
   # Install Docker
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh
   sudo usermod -aG docker $USER
   
   # Install Docker Compose
   sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
   sudo chmod +x /usr/local/bin/docker-compose
   ```

2. **Setup application:**
   ```bash
   # Create directory
   mkdir -p /opt/expenselocator
   cd /opt/expenselocator
   
   # Copy configuration files
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Deploy:**
   ```bash
   docker-compose up -d
   ```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `REPLIT_CLIENT_ID` | Replit OAuth Client ID | Yes |
| `REPLIT_CLIENT_SECRET` | Replit OAuth Client Secret | Yes |
| `REPLIT_REDIRECT_URI` | OAuth callback URL | Yes |
| `POSTGRES_PASSWORD` | Database password | Yes |
| `SESSION_SECRET` | Session encryption key | Yes |
| `ALLOWED_ORIGINS` | Comma-separated allowed origins | Yes |
| `APP_PORT` | Application port (default: 80) | No |
| `POSTGRES_PORT` | Database port (default: 5432) | No |

### Replit Authentication Setup

1. Go to [Replit Account Settings](https://replit.com/account/authentication)
2. Create a new OAuth application
3. Set the redirect URI to: `https://your-domain.com/api/auth/callback`
4. Copy the Client ID and Secret to your `.env` file

## Architecture

### Services

- **app**: ExpenseLocator Node.js application
- **postgres**: PostgreSQL database
- **nginx**: Reverse proxy (optional, with SSL)

### Volumes

- `postgres_data`: Database persistence
- `uploads_data`: File upload storage

### Network

- `expenselocator-network`: Internal container communication

## Management Commands

### Using the maintenance script:

```bash
# Start application
expenselocator-maintenance start

# Stop application
expenselocator-maintenance stop

# Restart application
expenselocator-maintenance restart

# View logs
expenselocator-maintenance logs

# Update containers
expenselocator-maintenance update

# Create backup
expenselocator-maintenance backup

# Check status
expenselocator-maintenance status
```

### Using Docker Compose directly:

```bash
cd /opt/expenselocator

# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f

# Update services
docker-compose pull && docker-compose up -d

# Check status
docker-compose ps
```

### Using systemd:

```bash
# Start
sudo systemctl start expenselocator

# Stop
sudo systemctl stop expenselocator

# Restart
sudo systemctl restart expenselocator

# Enable auto-start
sudo systemctl enable expenselocator

# Check status
sudo systemctl status expenselocator
```

## SSL/TLS Configuration

### Option 1: Using nginx with Let's Encrypt

1. **Install Certbot:**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   ```

2. **Generate certificate:**
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

3. **Enable nginx profile:**
   ```bash
   cd /opt/expenselocator
   docker-compose --profile nginx up -d
   ```

### Option 2: Using Cloudflare or other CDN

Configure your CDN to proxy requests to your VM's IP address on port 80.

## Monitoring and Logs

### View application logs:
```bash
docker-compose logs -f app
```

### View database logs:
```bash
docker-compose logs -f postgres
```

### Health checks:
```bash
# Application health
curl http://localhost/api/health

# Database health
docker-compose exec postgres pg_isready -U postgres
```

## Backup and Recovery

### Automated Backups

Backups are automatically created daily at 2 AM via cron job.

### Manual Backup

```bash
# Create backup
expenselocator-maintenance backup

# Or manually:
cd /opt/expenselocator
docker-compose exec postgres pg_dump -U postgres expenselocator | gzip > backup.sql.gz
```

### Restore from Backup

```bash
# Stop application
docker-compose down

# Restore database
gunzip -c backup.sql.gz | docker-compose exec -T postgres psql -U postgres expenselocator

# Start application
docker-compose up -d
```

## Security Considerations

### Firewall Configuration

The installation script configures UFW with the following rules:
- SSH (22): Allow
- HTTP (80): Allow
- HTTPS (443): Allow
- PostgreSQL (5432): Allow (if external access needed)

### Additional Security Measures

1. **Change default passwords:**
   - Update `POSTGRES_PASSWORD` in `.env`
   - Ensure `SESSION_SECRET` is secure (32+ characters)

2. **Enable fail2ban:**
   ```bash
   sudo systemctl enable fail2ban
   sudo systemctl start fail2ban
   ```

3. **Regular updates:**
   ```bash
   # Update system packages
   sudo apt update && sudo apt upgrade

   # Update Docker images
   expenselocator-maintenance update
   ```

4. **Monitor logs:**
   ```bash
   # Application logs
   expenselocator-maintenance logs

   # System logs
   sudo journalctl -u expenselocator
   ```

## Troubleshooting

### Common Issues

1. **Permission denied errors:**
   ```bash
   sudo chown -R $USER:$USER /opt/expenselocator
   ```

2. **Database connection issues:**
   ```bash
   # Check database status
   docker-compose exec postgres pg_isready -U postgres
   
   # Reset database
   docker-compose down -v
   docker-compose up -d
   ```

3. **Port conflicts:**
   ```bash
   # Check what's using port 80
   sudo netstat -tulpn | grep :80
   
   # Change APP_PORT in .env
   nano .env
   ```

4. **SSL certificate issues:**
   ```bash
   # Renew Let's Encrypt certificate
   sudo certbot renew
   
   # Restart nginx
   docker-compose restart nginx
   ```

### Getting Help

1. Check application logs: `expenselocator-maintenance logs`
2. Check system status: `expenselocator-maintenance status`
3. Verify configuration: `cat /opt/expenselocator/.env`
4. Test connectivity: `curl http://localhost/api/health`

## Performance Optimization

### For Production Deployments

1. **Increase resource limits:**
   ```yaml
   # In docker-compose.yml, add to app service:
   deploy:
     resources:
       limits:
         memory: 1G
         cpus: '0.5'
   ```

2. **Enable connection pooling:**
   - Update `DATABASE_URL` with connection pool parameters
   - Consider using PgBouncer for high-traffic scenarios

3. **Optimize nginx:**
   - Adjust worker processes based on CPU cores
   - Fine-tune caching headers
   - Enable HTTP/2

4. **Database optimization:**
   ```bash
   # Tune PostgreSQL settings in docker-compose.yml
   environment:
     POSTGRES_SHARED_PRELOAD_LIBRARIES: pg_stat_statements
     POSTGRES_MAX_CONNECTIONS: 100
     POSTGRES_SHARED_BUFFERS: 256MB
   ```

## Scaling Considerations

For high-availability deployments, consider:

1. **Load balancing:** Multiple app instances behind nginx
2. **Database clustering:** PostgreSQL primary/replica setup
3. **Shared storage:** Network-attached storage for uploads
4. **Monitoring:** Prometheus + Grafana for metrics
5. **Backup strategy:** Automated offsite backups

This completes the Docker deployment setup for ExpenseLocator. The system is designed to be production-ready with proper security, monitoring, and maintenance capabilities.