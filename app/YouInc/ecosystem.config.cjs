module.exports = {
    apps: [
      {
        name: "youinc",
        cwd: "/var/www/html/YouInc",
        script: "npm",
        args: "run start -- -p 4001",
        env: {
          NODE_ENV: "production",
          YOUINC_SYNC_KEY: "margo777",
          NEXT_PUBLIC_YOUINC_SYNC_KEY: "margo777",
          GOOGLE_APPLICATION_CREDENTIALS: "/var/www/secrets/firebase-admin.json",
        },
      },
    ],
  };