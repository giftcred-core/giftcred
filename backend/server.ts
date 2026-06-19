import { createApp } from "./src/app.js";

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 8000);
const app = createApp();

const server = app.listen(port, host, () => {
  console.log(`Giftcred API listening on http://${host}:${port}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received — closing server`);
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
