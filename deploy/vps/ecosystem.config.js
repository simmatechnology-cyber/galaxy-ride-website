// PM2 process definition for the Galaxy Ride API on the VPS.
// Usage: pm2 start deploy/vps/ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'galaxyride-api',
      script: 'deploy/vps/server.js',
      cwd: '/home/galaxyride/public_html',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      out_file:   '/home/galaxyride/logs/galaxyride-api.out.log',
      error_file: '/home/galaxyride/logs/galaxyride-api.err.log',
      time: true,
    },
  ],
};
