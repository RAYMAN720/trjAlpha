import { spawn } from "node:child_process";

const maxAttempts = Number(process.env.DB_DEPLOY_MAX_ATTEMPTS ?? 18);
const delayMs = Number(process.env.DB_DEPLOY_RETRY_MS ?? 10_000);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runPrismaPush() {
  return new Promise((resolve) => {
    const child = spawn(
      "npx",
      ["prisma", "db", "push", "--schema", "prisma/schema.postgres.prisma", "--accept-data-loss"],
      {
        cwd: new URL("..", import.meta.url),
        env: process.env,
        stdio: "inherit"
      }
    );

    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", (error) => {
      console.error(`[render-deploy-postgres] failed to start Prisma: ${error.message}`);
      resolve(1);
    });
  });
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  console.log(`[render-deploy-postgres] Applying PostgreSQL schema, attempt ${attempt}/${maxAttempts}`);
  const exitCode = await runPrismaPush();
  if (exitCode === 0) {
    console.log("[render-deploy-postgres] PostgreSQL schema is ready.");
    process.exit(0);
  }

  if (attempt < maxAttempts) {
    console.log(`[render-deploy-postgres] Database not ready yet. Retrying in ${Math.round(delayMs / 1000)}s...`);
    await wait(delayMs);
  }
}

console.error("[render-deploy-postgres] PostgreSQL schema deploy failed after all retry attempts.");
process.exit(1);
