import { createApp } from "./app";
import { getEnv } from "./config/env";

const app = createApp();
const env = getEnv();

// Proses server dijalankan hanya setelah validasi environment berhasil (fail-fast).
const server = app.listen(env.PORT, () => {
  console.log(`Warehouse Receiving backend listening on port ${env.PORT}`);
});

export default server;
