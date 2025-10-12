# Apps Script snapshot testing

The Apps Script compiler relies on end-to-end snapshots to guarantee that helper templates and runtime glue
code remain stable across connector tiers. The vitest suite `server/workflow/__tests__/compile-to-appsscript.snapshots.test.ts`
compiles workflow graphs under `server/workflow/__tests__/fixtures/apps-script/` and compares the generated
`Code.gs` and `appsscript.json` files against committed snapshots.

## Regenerating snapshots

Run the snapshot refresher whenever you make changes that affect the compiler templates, shared helpers,
or connector-specific code generation.

```bash
node --experimental-strip-types server/workflow/__tests__/fixtures/apps-script/refresh-snapshots.ts
```

This command rewrites the snapshots in `server/workflow/__tests__/fixtures/apps-script/__snapshots__/` using
the current compiler output. Commit the updated `.snap` files alongside your template changes.

> **Note:** The script uses Node's experimental type stripping to execute the TypeScript compiler module
> without a build step. Avoid editing the generated runtime helper that the script writes to the
> repository; it is cleaned up automatically.

## Updating failing tests

When the vitest suite reports a snapshot mismatch, review the diff to ensure the new output is expected.
If the changes are intentional, rerun the command above to refresh the snapshots and then re-run
`vitest run server/workflow/__tests__/compile-to-appsscript.snapshots.test.ts --coverage` to confirm the
suite passes.
