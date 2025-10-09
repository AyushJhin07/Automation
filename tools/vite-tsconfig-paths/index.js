import fs from "node:fs";
import path from "node:path";

const normalizePattern = (pattern) => pattern.replace(/\/\*$/, "");

const resolveTarget = (projectDir, baseUrl, target) => {
  const withoutGlob = target.replace(/\/\*$/, "");
  const resolvedBase = baseUrl ? path.resolve(projectDir, baseUrl) : projectDir;
  return path.resolve(resolvedBase, withoutGlob);
};

export default function tsconfigPaths(options = {}) {
  const projects = Array.isArray(options.projects) ? options.projects : [];
  return {
    name: "local-tsconfig-paths",
    config() {
      const alias = {};

      for (const projectEntry of projects) {
        if (!projectEntry) continue;
        const tsconfigPath = path.resolve(projectEntry);
        if (!fs.existsSync(tsconfigPath)) continue;

        const projectDir = path.dirname(tsconfigPath);
        let content;
        try {
          content = JSON.parse(fs.readFileSync(tsconfigPath, "utf8"));
        } catch (error) {
          continue;
        }

        const compilerOptions = content?.compilerOptions ?? {};
        const baseUrl = compilerOptions.baseUrl ?? "";
        const paths = compilerOptions.paths ?? {};

        for (const [pattern, mappings] of Object.entries(paths)) {
          if (!Array.isArray(mappings) || mappings.length === 0) continue;
          const target = mappings[0];
          if (typeof target !== "string" || target.length === 0) continue;

          const key = normalizePattern(pattern);
          const resolved = resolveTarget(projectDir, baseUrl, target);
          alias[key] = resolved;
        }
      }

      return { resolve: { alias } };
    },
  };
}
