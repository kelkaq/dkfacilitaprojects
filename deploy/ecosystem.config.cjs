/**
 * PM2 Ecosystem Configuration — DK Facilita / Certifica Software - DK
 * Uso em VPS Ubuntu:
 *   pm2 start deploy/ecosystem.config.cjs --env production
 *   pm2 save
 *   pm2 startup
 */
module.exports = {
  apps: [
    {
      name: 'dkfacilita-api',
      script: 'npx',
      args: 'tsx server.ts',
      cwd: '/var/www/dkfacilita',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: '/var/log/pm2/dkfacilita-api-error.log',
      out_file: '/var/log/pm2/dkfacilita-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
