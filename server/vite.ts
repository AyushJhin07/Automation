import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { type Server } from "http";
import { nanoid } from "nanoid";

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

export async function setupVite(app: Express, server: Server): Promise<boolean> {
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

    return false;
  }

  if (!viteModule) {
    return false;
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
    viteConfig = viteConfigModule?.default ?? viteConfigModule;
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

    return false;
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

  return true;
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
