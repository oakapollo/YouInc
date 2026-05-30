module.exports = {
    apps: [
      {
        name: "youinc",
        cwd: "/var/www/html/YouInc",
        script: "npm",
        args: "run start -- -p 4001",
        env: {
          NODE_ENV: "production",
          YOUINC_SYNC_KEY: process.env.YOUINC_SYNC_KEY,
          GOOGLE_APPLICATION_CREDENTIALS: "/var/www/secrets/firebase-admin.json",
        },
      },
    ],
  };
