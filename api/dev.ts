import { createApp } from "./src/app.js";

const port = Number(process.env.PORT || 8000);
const app = createApp();

app.listen(port, () => {
  console.log(`Giftcred API listening on http://127.0.0.1:${port}`);
});
