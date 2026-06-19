/** PM2 config — run on your whitelisted-IP VPS: `pm2 start ecosystem.config.cjs` */
module.exports = {
  apps: [
    {
      name: "giftcred-api",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "backend/server.ts",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 8000,
        HOST: "0.0.0.0",
      },
    },
  ],
};
