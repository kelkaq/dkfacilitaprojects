# Guia de Deploy em VPS Ubuntu — DK Facilita (`dkfacilita.com`)

Este guia descreve o passo a passo exato para colocar em produção todo o ecossistema **DK Facilita** + **Certifica Software - DK** em uma VPS **Ubuntu 22.04 LTS / 24.04 LTS**, com os 4 domínios oficiais, SSL gratuito (Certbot), PostgreSQL + Prisma e gerenciamento via PM2.

---

## 1. Apontamento de DNS (Registro A)

No painel do seu registrador de domínio, aponte os registros **A** para o IP público da sua VPS:

| Tipo | Nome / Host | Destino | Finalidade |
| --- | --- | --- | --- |
| `A` | `@` | `IP_DA_VPS` | Site institucional e checkout (`dkfacilita.com`) |
| `A` | `www` | `IP_DA_VPS` | Redirecionamento `www.dkfacilita.com` |
| `A` | `certifica` | `IP_DA_VPS` | Painel SaaS dos clientes (`certifica.dkfacilita.com`) |
| `A` | `admin` | `IP_DA_VPS` | Painel Super Admin (`admin.dkfacilita.com`) |
| `A` | `api` | `IP_DA_VPS` | Backend API e Webhook Asaas (`api.dkfacilita.com`) |

---

## 2. Preparação do Servidor Ubuntu

Conecte via SSH na VPS e instale Node.js 20 LTS, PostgreSQL, Nginx (ou Apache), Certbot e PM2:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential postgresql postgresql-contrib nginx certbot python3-certbot-nginx

# Instalar Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Instalar PM2 globalmente
sudo npm install -g pm2
```

---

## 3. Criação do Banco de Dados PostgreSQL

```bash
sudo -u postgres psql << 'EOF'
CREATE USER dkfacilita_user WITH PASSWORD 'TROCAR_POR_SENHA_FORTE';
CREATE DATABASE dkfacilita_certifica OWNER dkfacilita_user;
GRANT ALL PRIVILEGES ON DATABASE dkfacilita_certifica TO dkfacilita_user;
EOF
```

---

## 4. Clonar Repositório, Configurar `.env` e Rodar Build

```bash
sudo mkdir -p /var/www/dkfacilita /var/log/pm2
sudo chown -R $USER:$USER /var/www/dkfacilita /var/log/pm2

git clone https://github.com/SEU_USUARIO/dkfacilita-certifica.git /var/www/dkfacilita
cd /var/www/dkfacilita

# Instalar dependências
npm ci

# Criar arquivo .env de produção
cp deploy/.env.example .env
nano .env
```

Preencha no `.env`:
- `DATABASE_URL` com usuário, senha e nome do banco criado no Passo 3.
- `JWT_SECRET` (gere com `openssl rand -hex 32`).
- `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` obtidos na conta Asaas.

### Aplicar Migrações Prisma + Seed Global + Build de Produção

```bash
npx prisma generate
npx prisma migrate deploy
npx tsx prisma/seed.ts
npm run build
```

---

## 5. Subir Backend API com PM2

```bash
pm2 start deploy/ecosystem.config.cjs --env production
pm2 save
pm2 startup
```

Verifique se a API responde corretamente:

```bash
curl -s http://127.0.0.1:3000/api/health
```

---

## 6. Configurar Proxy Reverso e SSL (Nginx — Recomendado)

```bash
sudo cp deploy/nginx-dkfacilita.conf /etc/nginx/sites-available/dkfacilita.conf
sudo ln -sf /etc/nginx/sites-available/dkfacilita.conf /etc/nginx/sites-enabled/dkfacilita.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# Emitir certificados SSL gratuitos para todos os domínios
sudo certbot --nginx \
  -d dkfacilita.com \
  -d www.dkfacilita.com \
  -d certifica.dkfacilita.com \
  -d admin.dkfacilita.com \
  -d api.dkfacilita.com
```

### Alternativa com Apache2

Caso sua VPS utilize Apache2 em vez de Nginx:

```bash
sudo a2enmod proxy proxy_http rewrite headers ssl
sudo cp deploy/apache-dkfacilita.conf /etc/apache2/sites-available/dkfacilita.conf
sudo a2ensite dkfacilita.conf
sudo apache2ctl configtest && sudo systemctl reload apache2
sudo certbot --apache \
  -d dkfacilita.com \
  -d www.dkfacilita.com \
  -d certifica.dkfacilita.com \
  -d admin.dkfacilita.com \
  -d api.dkfacilita.com
```

---

## 7. Configurar Webhook no Painel Asaas

No painel da **Asaas** (*Integrações → Webhooks*):
1. **URL do Webhook:** `https://api.dkfacilita.com/webhooks/asaas`
2. **Token de Autenticação (`asaas-access-token`):** exatamente o mesmo valor de `ASAAS_WEBHOOK_TOKEN` definido no `.env`.
3. **Eventos habilitados:** `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, `PAYMENT_DELETED`.

---

## 8. Rotina de Atualização (Deploy Contínuo)

Sempre que enviar atualizações para o GitHub:

```bash
cd /var/www/dkfacilita
git pull origin main
npm ci
npx prisma migrate deploy
npm run build
pm2 reload dkfacilita-api
```
