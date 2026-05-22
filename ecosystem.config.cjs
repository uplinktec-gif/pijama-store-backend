module.exports = {
  apps: [{
    name: 'pijama-store',
    script: 'server.js',
    cwd: '/opt/pijama-store',
    instances: 1,
    exec_mode: 'fork',
    env: { NODE_ENV: 'production', PORT: 3000 },
    restart_delay: 3000,
    max_restarts: 10,
    min_uptime: '5s',
    out_file: '/opt/pijama-store/logs/pm2-out.log',
    error_file: '/opt/pijama-store/logs/pm2-err.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    watch: false
  }]
};
