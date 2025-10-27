# Frontend Deployment Guide

This guide covers deploying the Remote Work Collaboration Suite frontend applications.

## Deployment Options

1. **Static Hosting**: Vercel, Netlify, Cloudflare Pages
2. **Container Platforms**: Docker + any cloud provider
3. **Traditional Hosting**: Nginx, Apache

## Prerequisites

- Build the frontend applications
- Set up environment variables pointing to your backend
- Configure CORS on backend to allow frontend domain

## Environment Variables

Create a `.env` file in each app or set them in your hosting platform:

**apps/web/.env:**
```env
VITE_API_URL=https://your-backend-api.com
VITE_WS_URL=wss://your-backend-api.com
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_ENVIRONMENT=production
```

**apps/collab-suite/.env:**
```env
VITE_API_URL=https://your-backend-api.com
VITE_WS_URL=wss://your-backend-api.com
VITE_ENVIRONMENT=production
```

## Option 1: Vercel Deployment (Recommended)

Vercel is the easiest and fastest way to deploy React applications.

### Automatic Deployment

1. **Push code** to your GitHub repository
2. **Import project** in Vercel dashboard
   - Go to https://vercel.com
   - Click "Add New Project"
   - Import from GitHub
   - Select `remote-collab-frontend` repository

3. **Configure Root Directory**:
   - If deploying just one app: Set root directory to `apps/web` or `apps/collab-suite`
   - If deploying both: Use monorepo setup (keep root as `.`)

4. **Set Build Command**:
   ```
   pnpm install && pnpm build
   ```

5. **Set Output Directory**:
   ```
   apps/web/dist
   ```
   (or `apps/collab-suite/dist`)

6. **Add Environment Variables** in Vercel dashboard

7. **Deploy**!

### Manual Deployment with Vercel CLI

```bash
npm i -g vercel
vercel login
vercel --prod
```

## Option 2: Netlify Deployment

### Automatic Deployment

1. **Connect GitHub** to Netlify
2. **Create New Site** from Git
3. **Set build settings**:
   - Base directory: `apps/web`
   - Build command: `pnpm build`
   - Publish directory: `apps/web/dist`

4. **Add Environment Variables** in Site settings

5. **Deploy**

### Manual Deployment

```bash
# Build the app
cd apps/web
pnpm build

# Install Netlify CLI
npm i -g netlify-cli

# Deploy
netlify deploy --prod --dir=dist
```

## Option 3: Cloudflare Pages

1. **Connect GitHub** to Cloudflare Pages
2. **Select repository**: `remote-collab-frontend`
3. **Configure build**:
   - Framework preset: Vite
   - Build command: `pnpm build`
   - Build output directory: `apps/web/dist`
   - Root directory: `apps/web`

4. **Add Environment Variables** in Pages settings

5. **Deploy**

## Option 4: Docker Deployment

### Create Dockerfile

**For apps/web:**
```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY package.json pnpm-workspace.yaml ./
COPY apps ./apps

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build app
WORKDIR /app/apps/web
RUN pnpm build

# Production stage
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Copy nginx config
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### Create nginx.conf

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api {
        proxy_pass https://your-backend-api.com;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Socket.io proxy
    location /socket.io {
        proxy_pass https://your-backend-api.com;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### Build and Run

```bash
# Build image
docker build -t remote-collab-frontend .

# Run container
docker run -d -p 80:80 remote-collab-frontend
```

## Option 5: VPS Deployment (Nginx)

### On DigitalOcean / AWS EC2 / Linode

1. **SSH into your server**:
   ```bash
   ssh user@your-server-ip
   ```

2. **Install Node.js and pnpm**:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   sudo npm install -g pnpm
   ```

3. **Install Nginx**:
   ```bash
   sudo apt update
   sudo apt install nginx
   ```

4. **Clone and build**:
   ```bash
   git clone https://github.com/Sami2905/remote-collab-frontend.git
   cd remote-collab-frontend
   
   # Set environment variables
   cd apps/web
   echo "VITE_API_URL=https://your-backend-api.com" > .env
   echo "VITE_WS_URL=wss://your-backend-api.com" >> .env
   
   # Build
   cd ../..
   pnpm install
   pnpm build
   ```

5. **Configure Nginx**:
   ```bash
   sudo nano /etc/nginx/sites-available/frontend
   ```

   Add configuration:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       root /home/user/remote-collab-frontend/apps/web/dist;
       index index.html;

       # SPA routing
       location / {
           try_files $uri $uri/ /index.html;
       }

       # Security headers
       add_header X-Frame-Options "SAMEORIGIN" always;
       add_header X-Content-Type-Options "nosniff" always;
       add_header X-XSS-Protection "1; mode=block" always;

       # Cache static assets
       location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
           expires 1y;
           add_header Cache-Control "public, immutable";
       }
   }
   ```

6. **Enable site**:
   ```bash
   sudo ln -s /etc/nginx/sites-available/frontend /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

7. **Setup SSL with Let's Encrypt**:
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

## Monorepo Deployment (Both Apps)

If you want to deploy both frontend apps from one repository:

### Vercel

1. Set root directory to repository root
2. Configure build command:
   ```bash
   pnpm install && pnpm build
   ```
3. For multiple apps, use **Monorepo** configuration:
   - Select each app separately
   - Set appropriate root directories (`apps/web` and `apps/collab-suite`)
   - Configure unique output directories

### Netlify

Create two separate Netlify sites:
- One pointing to `apps/web/dist`
- One pointing to `apps/collab-suite/dist`

## CI/CD Setup

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy Frontend

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install pnpm
        run: npm install -g pnpm
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Build
        run: pnpm build
        env:
          VITE_API_URL: ${{ secrets.VITE_API_URL }}
          VITE_WS_URL: ${{ secrets.VITE_WS_URL }}
      
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
          working-directory: ./apps/web
```

## Production Checklist

- [ ] Build applications for production
- [ ] Configure environment variables
- [ ] Set up domain and SSL
- [ ] Configure CORS on backend
- [ ] Test WebSocket connections
- [ ] Enable gzip compression
- [ ] Setup CDN for static assets
- [ ] Configure proper caching headers
- [ ] Enable security headers
- [ ] Setup monitoring (Sentry, LogRocket)
- [ ] Test on multiple browsers
- [ ] Mobile responsiveness check
- [ ] Performance optimization

## Environment Variables

Make sure to set these in your deployment platform:

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `https://api.yourapp.com` |
| `VITE_WS_URL` | WebSocket URL | `wss://api.yourapp.com` |
| `VITE_SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key | `eyJ...` |

## Build Commands

**Single app (web)**:
```bash
cd apps/web
pnpm build
```

**Single app (collab-suite)**:
```bash
cd apps/collab-suite
pnpm build
```

**All apps**:
```bash
pnpm build
```

## Performance Optimization

1. **Enable Gzip/Brotli compression**
2. **Use CDN** for static assets
3. **Implement lazy loading**
4. **Code splitting**
5. **Image optimization**
6. **Service Worker** for PWA
7. **Minimize bundle size**

## Security

1. **Use HTTPS** everywhere
2. **Set proper CSP headers**
3. **Validate environment variables**
4. **Don't expose API keys** in client code
5. **Implement rate limiting** on backend
6. **Use secure cookies** if applicable
7. **Content Security Policy**

## Troubleshooting

**Build fails**:
- Check Node.js version (requires 18+)
- Verify all dependencies are installed
- Check environment variables are set

**WebSocket not connecting**:
- Verify backend CORS settings
- Check WebSocket URL is correct (wss:// for HTTPS)
- Verify backend is deployed and accessible

**Static assets not loading**:
- Check output directory path
- Verify base path in vite.config.ts
- Check nginx/Apache configuration

**API calls failing**:
- Verify CORS is configured on backend
- Check API URL environment variable
- Verify backend is accessible

## Support

For issues, please open a GitHub issue at:
https://github.com/Sami2905/remote-collab-frontend/issues

