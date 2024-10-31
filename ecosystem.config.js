module.exports = {
  apps: [
    {
      name: "milton-tracker",
      script: "./app.mjs",
      max_restarts: 30,
      restart_delay: 10000,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        API_KEY: "go-away-milton"
      }
    }
  ]
};
