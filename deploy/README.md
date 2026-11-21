# Polo Sanca — Low-Cost Production Deployment Guide

Portable Docker Compose + Caddy (automatic Let's Encrypt HTTPS) stack that runs identically on:
- **AWS Lightsail 2 GB RAM** (~\$10–\$12/mo, includes static IPv4 + 2–3 TB bandwidth)
- **Hetzner Cloud CAX11** (~\$4.50/mo, 2 vCPU, 4 GB RAM, 40 GB NVMe)
- **AWS EC2 `t4g.small` / `t3.micro`**

Pair with **AWS S3 + CloudFront** (or **Cloudflare Pages**) for the static React frontend and **Amazon SES** for email.

---

## 1. Provision & Prepare the VPS (Ubuntu 24.04)

1. Open firewall ports **22**, **80**, and **443** only (keep PostgreSQL `5432` and Redis `6379` private).
2. Point your API DNS `A` record (`api.polosanca.com`) to the VPS static IP.
3. Install Docker Engine + Compose plugin:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker "$USER"
   ```
4. *(Recommended on 1–2 GB RAM instances)* Add a 2 GB swap file:
   ```bash
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
   sudo mkswap /swapfile && sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```

---

## 2. Configure & Start Backend Services

```bash
git clone <your-repo-url> /opt/polosanca
cd /opt/polosanca

cp deploy/.env.prod.example deploy/.env.prod
chmod 600 deploy/.env.prod
# Edit deploy/.env.prod with real secrets, API_DOMAIN, FRONTEND_URL, CORS_ORIGINS, and SES credentials
```

Build and launch the stack:

```bash
docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
```

Run database migrations (first deploy and after any migration):

```bash
docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod \
  exec api flask db upgrade
```

Verify health over HTTPS:

```bash
curl -fsS https://api.polosanca.com/health
```

---

## 3. Deploy Frontend SPA (S3 + CloudFront or Cloudflare Pages)

Build with your production API URL:

```bash
cd frontend
VITE_API_URL=https://api.polosanca.com/v1 npm ci && VITE_API_URL=https://api.polosanca.com/v1 npm run build
```

- **S3 + CloudFront**: Sync `frontend/dist/` to your S3 bucket (`aws s3 sync dist/ s3://<bucket> --delete`), set CloudFront custom error response `403/404 → /index.html` (`200`), and invalidate `/*`.
- **Cloudflare Pages**: Connect the GitHub repo, set root directory to `frontend`, build command `npm run build`, output directory `dist`, and environment variable `VITE_API_URL=https://api.polosanca.com/v1`.

---

## 4. Enable Nightly Database Backups

```bash
chmod +x /opt/polosanca/deploy/backup-db.sh
crontab -e
# Add:
0 3 * * * /opt/polosanca/deploy/backup-db.sh >> /var/log/polosanca-backup.log 2>&1
```

Set `BACKUP_S3_URI=s3://your-backup-bucket/prod` in `deploy/.env.prod` (and attach an IAM role or AWS CLI credentials) to automatically mirror encrypted dumps to S3.
