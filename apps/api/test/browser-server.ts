import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/module";
import { AiProvider } from "../src/ai";
import { FixtureProvider } from "./fixtures";

async function start() {
  if (process.env.BROWSER_E2E !== "1") {
    throw new Error(
      "Refusing to start browser fixture API without BROWSER_E2E=1",
    );
  }
  const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
  if (!["127.0.0.1", "localhost", "::1"].includes(databaseUrl.hostname)) {
    throw new Error("Browser fixture API only accepts a loopback DATABASE_URL");
  }
  const port = Number(process.env.BROWSER_E2E_API_PORT ?? 3161);
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AiProvider)
    .useValue(new FixtureProvider())
    .compile();
  const app = module.createNestApplication();
  app.enableShutdownHooks();
  await app.listen(port, "127.0.0.1");
  process.stdout.write(`Browser fixture API ready on 127.0.0.1:${port}\n`);
}

void start().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
