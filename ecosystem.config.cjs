module.exports = {
  apps: [
    {
      name: 'hub-whatsapp-bot',
      script: 'src/index.js',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      time: true,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
