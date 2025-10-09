import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { type Server } from "http";
import { nanoid } from "nanoid";

function resolveClientDistPath(): string | undefined {
  const candidates = [
    path.resolve(import.meta.dirname, "public"),
    path.resolve(import.meta.dirname, "../dist/public"),
    path.resolve(process.cwd(), "dist/public"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function extractMissingModuleName(error: unknown): string | undefined {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as Error).message);
    const match = message.match(/Cannot find (?:module|package) ['"]([^'"]+)['"]/);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  let viteModule: typeof import("vite") | undefined;
  try {
    viteModule = await import("vite");
  } catch (error) {
    const message =
      "⚠️  Vite is not available. Install dev dependencies with `npm install` to enable the dev server, or set DISABLE_VITE=true.";

    console.warn(message);
    if (error) {
      console.warn("👉 Original error:", error);
    }

    return;
  }

  if (!viteModule) {
    return;
  }

  const { createServer: createViteServer, createLogger } = viteModule;
  const viteLogger = createLogger();
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true,
  };

  let viteConfig;
  try {
    const viteConfigModule = await import("../vite.config.ts");
    viteConfig = viteConfigModule.default ?? viteConfigModule;
  } catch (error) {
    const isModuleNotFound =
      (error as NodeJS.ErrnoException)?.code === "ERR_MODULE_NOT_FOUND";

    if (isModuleNotFound) {
      const missingModule = extractMissingModuleName(error);
      const missingLabel = missingModule
        ? `'${missingModule}'`
        : "a Vite plugin or dependency";

      console.warn(
        `⚠️  Failed to load Vite config because ${missingLabel} is missing. Install dev dependencies (npm install) or disable Vite with DISABLE_VITE=true.`,
      );
    } else {
      console.warn(
        "⚠️  Failed to load Vite config. Skipping Vite dev server setup.",
        error,
      );
    }

    return;
  }

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = resolveClientDistPath();

  if (!distPath) {
    const expectedPaths = [
      path.resolve(import.meta.dirname, "public"),
      path.resolve(import.meta.dirname, "../dist/public"),
      path.resolve(process.cwd(), "dist/public"),
    ];

    throw new Error(
      `Could not find the build directory. Checked: ${expectedPaths.join(", ")}. Make sure to build the client first.`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
