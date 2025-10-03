# Connector Parity Checklist

The automation platform expects every stable connector definition in
`server/connector-manifest.json` to have a matching API client under
`server/integrations` that exports at least one handler. The
`scripts/check-connector-parity.ts` guard enforces this agreement during
`npm run lint`.

## Running the check locally

```bash
npm run lint
```

The command runs `tsc` followed by the parity script. If mismatches are
found, the script prints a bulleted list describing what is missing.
Common messages include:

- `Stable connector "{id}" is missing an API client` – the manifest marks
the connector as `"stable"`, but there is no corresponding
`*APIClient.ts` file.
- `Stable connector "{id}" (...) does not register any handlers` – the
API client exists but never calls `registerHandler(s)`.
- `Integration file ... does not have a corresponding entry` – an API
client exists without a manifest entry.

The script exits with a non-zero status so CI will fail until the issues
are resolved.

## Remediation steps

1. **Identify the expected connector ID.** The manifest entry’s
   `normalizedId` must match the API client’s name when converted to
   canonical form (e.g. `AirtableAPIClient.ts` → `airtable`).
2. **Create or update the API client.**
   - If the file is missing, copy an existing client that targets a
     similar API and implement the required handlers.
   - Ensure the client calls `registerHandler` or `registerHandlers` for
     every operation you want to expose.
3. **Update the manifest if needed.**
   - Add a manifest entry for any new API client. Point
     `definitionPath` to the connector JSON under `connectors/`.
   - Mark connectors as `"stable"` only after their handlers are
     implemented.
4. **Add or adjust the connector definition.** Confirm the JSON file
   referenced by `definitionPath` exists and describes the actions or
   triggers supplied by the handlers.
5. **Re-run `npm run lint`.** Continue refining the changes until the
   parity script reports success.

When in doubt, review similar connectors in the repository to model file
structure, handler naming, and manifest entries.
