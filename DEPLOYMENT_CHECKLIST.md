# Multi-User Deployment Checklist

Use this checklist to ensure a successful deployment of CloudCLI's multi-user container architecture.

## Pre-Deployment

### Server Requirements

- [ ] Server meets minimum requirements:
  - [ ] Docker Engine 20.10+ installed
  - [ ] At least 16GB RAM (32GB+ recommended)
  - [ ] 4+ CPU cores
  - [ ] 100GB+ free disk space
  - [ ] Ubuntu 20.04+ or similar Linux distribution

- [ ] Server is accessible:
  - [ ] SSH access configured
  - [ ] Firewall rules allow HTTPS (443) and HTTP (80)
  - [ ] Domain name configured (for production)

### Docker Setup

- [ ] Docker installed and running:
  ```bash
  docker --version  # Should be 20.10+
  docker info       # Verify daemon is running
  ```

- [ ] Docker Compose installed:
  ```bash
  docker-compose --version  # Should be 1.29+
  ```

- [ ] Docker socket permissions configured:
  ```bash
  sudo usermod -aG docker $USER
  # Logout and login for group membership to take effect
  ```

- [ ] Test Docker:
  ```bash
  docker run hello-world
  ```

### Security Preparation

- [ ] SSL/TLS certificate obtained:
  - [ ] Using Let's Encrypt (recommended)
  - [ ] Using custom certificate
  - [ ] Certificate files accessible

- [ ] Generate encryption master key:
  ```bash
  export ENCRYPTION_MASTER_KEY=$(openssl rand -hex 32)
  echo $ENCRYPTION_MASTER_KEY  # SAVE THIS SECURELY!
  ```

- [ ] Store master key securely:
  - [ ] Password manager
  - [ ] Encrypted vault
  - [ ] Secure backup location
  - [ ] **NEVER commit to git**

- [ ] Optional API key for programmatic access:
  ```bash
  export API_KEY=$(openssl rand -hex 32)
  ```

## Build & Configuration

### Clone Repository

- [ ] Clone CloudCLI repository:
  ```bash
  git clone https://github.com/siteboon/claudecodeui.git
  cd claudecodeui
  ```

- [ ] Checkout feature branch (if not merged to main):
  ```bash
  git checkout feature/multi-user-container-architecture
  ```

### Environment Configuration

- [ ] Create `.env` file:
  ```bash
  cp .env.example .env
  ```

- [ ] Configure `.env`:
  ```bash
  # Required
  MULTI_USER_MODE=true
  ENCRYPTION_MASTER_KEY=<your-secure-key>

  # Optional
  SERVER_PORT=3001
  DATABASE_PATH=/data/auth.db
  DOCKER_HOST=unix:///var/run/docker.sock
  CONTAINER_BASE_IMAGE=cloudcliai/worker:latest
  CONTAINER_PORT_START=4001
  CONTAINER_PORT_END=5000
  CONTAINER_MEMORY_LIMIT=2g
  CONTAINER_CPU_LIMIT=1.0
  CONTAINER_STOP_ON_LOGOUT=false
  ```

- [ ] Verify `.env` file is in `.gitignore`
- [ ] Create secure backup of `.env` file

### Build Docker Images

- [ ] Build gateway image:
  ```bash
  docker build -t cloudcliai/gateway:latest .
  ```

- [ ] Verify gateway image:
  ```bash
  docker images | grep cloudcliai/gateway
  ```

- [ ] Build worker image:
  ```bash
  docker build -f docker/worker/Dockerfile -t cloudcliai/worker:latest .
  ```

- [ ] Verify worker image:
  ```bash
  docker images | grep cloudcliai/worker
  ```

- [ ] Optional: Tag images with version:
  ```bash
  docker tag cloudcliai/gateway:latest cloudcliai/gateway:v1.0.0
  docker tag cloudcliai/worker:latest cloudcliai/worker:v1.0.0
  ```

### Database Setup

- [ ] Create data directory:
  ```bash
  mkdir -p data/gateway
  ```

- [ ] Set permissions:
  ```bash
  chmod 755 data/gateway
  ```

- [ ] Database will be automatically initialized on first startup

## Deployment

### Docker Compose Deployment

- [ ] Review `docker-compose.yml`:
  ```bash
  cat docker-compose.yml
  ```

- [ ] Start gateway:
  ```bash
  docker-compose up -d gateway
  ```

- [ ] Check gateway status:
  ```bash
  docker-compose ps
  docker logs cloudcli-gateway
  ```

- [ ] Verify gateway health:
  ```bash
  curl http://localhost:3001/health
  ```

### Reverse Proxy Setup (Production)

#### Nginx Configuration

- [ ] Install Nginx:
  ```bash
  sudo apt update
  sudo apt install nginx
  ```

- [ ] Create Nginx configuration:
  ```bash
  sudo nano /etc/nginx/sites-available/cloudcli
  ```

- [ ] Add configuration:
  ```nginx
  server {
      listen 443 ssl http2;
      server_name your-domain.com;

      ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
      ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

      location / {
          proxy_pass http://localhost:3001;
          proxy_http_version 1.1;
          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection "upgrade";
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto $scheme;
          proxy_read_timeout 300s;
          proxy_connect_timeout 300s;
      }
  }

  server {
      listen 80;
      server_name your-domain.com;
      return 301 https://$server_name$request_uri;
  }
  ```

- [ ] Enable site:
  ```bash
  sudo ln -s /etc/nginx/sites-available/cloudcli /etc/nginx/sites-enabled/
  ```

- [ ] Test configuration:
  ```bash
  sudo nginx -t
  ```

- [ ] Reload Nginx:
  ```bash
  sudo systemctl reload nginx
  ```

#### Let's Encrypt SSL

- [ ] Install Certbot:
  ```bash
  sudo apt install certbot python3-certbot-nginx
  ```

- [ ] Obtain certificate:
  ```bash
  sudo certbot --nginx -d your-domain.com
  ```

- [ ] Verify auto-renewal:
  ```bash
  sudo certbot renew --dry-run
  ```

### Firewall Configuration

- [ ] Allow HTTP/HTTPS:
  ```bash
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  ```

- [ ] Block direct access to gateway port:
  ```bash
  sudo ufw deny 3001/tcp
  ```

- [ ] Enable firewall:
  ```bash
  sudo ufw enable
  ```

- [ ] Verify firewall status:
  ```bash
  sudo ufw status
  ```

## Post-Deployment Verification

### Smoke Tests

- [ ] Access application:
  - [ ] Open https://your-domain.com
  - [ ] Page loads successfully
  - [ ] No console errors

- [ ] Create test user:
  - [ ] Register new user account
  - [ ] Receive JWT token
  - [ ] Redirected to main UI

- [ ] Verify container creation:
  ```bash
  docker ps | grep cloudcli-user
  ```

- [ ] Check database:
  ```bash
  docker exec cloudcli-gateway sqlite3 /data/auth.db "SELECT * FROM users;"
  docker exec cloudcli-gateway sqlite3 /data/auth.db "SELECT * FROM user_containers;"
  ```

- [ ] Test container status:
  - [ ] Open Settings → Container
  - [ ] Status shows "running"
  - [ ] Container info displays correctly

- [ ] Test credentials:
  - [ ] Open Settings → Credentials
  - [ ] Add test credential
  - [ ] Verify success message
  - [ ] Check encryption in database

- [ ] Test proxy routing:
  - [ ] Create project
  - [ ] Edit files
  - [ ] Make git commit
  - [ ] All operations work correctly

### Performance Tests

- [ ] Measure container startup time:
  - [ ] Create new user
  - [ ] Time from login to "running" status
  - [ ] Target: < 60 seconds

- [ ] Test concurrent users:
  - [ ] Create 5-10 test users
  - [ ] All containers start successfully
  - [ ] Check resource usage: `docker stats`

- [ ] Monitor gateway performance:
  - [ ] Check CPU usage
  - [ ] Check memory usage
  - [ ] Check disk I/O

### Security Verification

- [ ] Test authentication:
  ```bash
  # Without token (should fail)
  curl https://your-domain.com/api/containers/status

  # With token (should succeed)
  curl -H "Authorization: Bearer <token>" https://your-domain.com/api/containers/status
  ```

- [ ] Verify SSL:
  ```bash
  curl -I https://your-domain.com
  # Check for "Strict-Transport-Security" header
  ```

- [ ] Check database encryption:
  ```bash
  docker exec cloudcli-gateway sqlite3 /data/auth.db "SELECT credential_value FROM user_credentials LIMIT 1;"
  # Should be encrypted hex string, not plaintext
  ```

- [ ] Verify container isolation:
  - [ ] User A cannot access User B's projects
  - [ ] User A cannot see User B's credentials
  - [ ] Containers on separate networks

## Monitoring Setup

### Logging

- [ ] Configure log rotation:
  ```bash
  sudo nano /etc/docker/daemon.json
  ```
  ```json
  {
    "log-driver": "json-file",
    "log-opts": {
      "max-size": "10m",
      "max-file": "3"
    }
  }
  ```

- [ ] Restart Docker:
  ```bash
  sudo systemctl restart docker
  ```

- [ ] Verify logging:
  ```bash
  docker logs cloudcli-gateway --tail 50
  ```

### Monitoring Tools (Optional)

- [ ] Install Prometheus (optional):
  ```bash
  docker run -d -p 9090:9090 prom/prometheus
  ```

- [ ] Install Grafana (optional):
  ```bash
  docker run -d -p 3000:3000 grafana/grafana
  ```

- [ ] Configure alerts for:
  - [ ] High CPU usage (> 80%)
  - [ ] High memory usage (> 90%)
  - [ ] Disk space low (< 10GB free)
  - [ ] Container failures

## Backup Configuration

### Database Backup

- [ ] Create backup script:
  ```bash
  cat > /usr/local/bin/backup-cloudcli.sh << 'EOF'
  #!/bin/bash
  BACKUP_DIR=/var/backups/cloudcli
  DATE=$(date +%Y%m%d-%H%M%S)

  mkdir -p $BACKUP_DIR
  docker exec cloudcli-gateway cp /data/auth.db /data/auth.db.backup
  docker cp cloudcli-gateway:/data/auth.db.backup $BACKUP_DIR/auth-$DATE.db

  # Keep only last 7 days
  find $BACKUP_DIR -name "auth-*.db" -mtime +7 -delete

  echo "Backup completed: $BACKUP_DIR/auth-$DATE.db"
  EOF
  chmod +x /usr/local/bin/backup-cloudcli.sh
  ```

- [ ] Test backup:
  ```bash
  /usr/local/bin/backup-cloudcli.sh
  ```

- [ ] Schedule daily backup:
  ```bash
  crontab -e
  # Add: 0 2 * * * /usr/local/bin/backup-cloudcli.sh
  ```

### Volume Backup (Optional)

- [ ] Create volume backup script:
  ```bash
  cat > /usr/local/bin/backup-volumes.sh << 'EOF'
  #!/bin/bash
  BACKUP_DIR=/var/backups/cloudcli/volumes
  DATE=$(date +%Y%m%d)

  mkdir -p $BACKUP_DIR

  for volume in $(docker volume ls --filter name=cloudcli-data-user -q); do
    docker run --rm \
      -v $volume:/data \
      -v $BACKUP_DIR:/backup \
      alpine tar czf /backup/$volume-$DATE.tar.gz -C /data .
  done

  echo "Volume backups completed"
  EOF
  chmod +x /usr/local/bin/backup-volumes.sh
  ```

## Documentation

- [ ] Document deployment:
  - [ ] Server details (IP, hostname, credentials location)
  - [ ] Encryption master key location
  - [ ] SSL certificate renewal process
  - [ ] Backup locations and schedule
  - [ ] Monitoring dashboard URLs

- [ ] Create runbook:
  - [ ] Startup procedures
  - [ ] Shutdown procedures
  - [ ] Backup/restore procedures
  - [ ] Troubleshooting common issues

- [ ] Share with team:
  - [ ] Access instructions
  - [ ] User registration process
  - [ ] Support contact information

## Maintenance Schedule

- [ ] Weekly:
  - [ ] Review logs for errors
  - [ ] Check disk space
  - [ ] Verify backups completed

- [ ] Monthly:
  - [ ] Update base images
  - [ ] Review resource usage
  - [ ] Clean up stale containers
  - [ ] Test backup restoration

- [ ] Quarterly:
  - [ ] Security updates
  - [ ] SSL certificate renewal check
  - [ ] Performance optimization review

## Rollback Plan

- [ ] Document current state:
  - [ ] Image versions
  - [ ] Configuration files
  - [ ] Database backup

- [ ] Test rollback procedure:
  - [ ] Stop containers
  - [ ] Restore database backup
  - [ ] Start with previous images
  - [ ] Verify functionality

- [ ] Keep rollback script ready:
  ```bash
  cat > /usr/local/bin/rollback-cloudcli.sh << 'EOF'
  #!/bin/bash
  docker-compose down
  docker exec cloudcli-gateway cp /data/auth.db.backup /data/auth.db
  docker-compose up -d
  EOF
  chmod +x /usr/local/bin/rollback-cloudcli.sh
  ```

## Support & Resources

- [ ] Documentation bookmarked:
  - [ ] [MULTI_USER_ARCHITECTURE.md](MULTI_USER_ARCHITECTURE.md)
  - [ ] [TESTING.md](TESTING.md)
  - [ ] [docker/MULTI_USER_DEPLOYMENT.md](docker/MULTI_USER_DEPLOYMENT.md)

- [ ] Community resources:
  - [ ] Discord: https://discord.gg/buxwujPNRE
  - [ ] GitHub Issues: https://github.com/siteboon/claudecodeui/issues
  - [ ] Documentation: https://cloudcli.ai/docs

## Sign-Off

Deployment completed by: ___________________

Date: ___________________

Verified by: ___________________

Date: ___________________

Notes:
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________
