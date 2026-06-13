import app from "./app.js";
import { env } from "./config/env.js";

app.listen(env.port, () => {
  console.log(`API running at http://localhost:${env.port}`);
  console.log(`Static files at http://localhost:${env.port}/static`);
});
