# Connector Output Schema Requirements

Connector definitions must include example payloads and JSON Schema metadata for every action and trigger. This page explains the expectations enforced by the automated validator and how to keep samples safe to share.

## JSON Schema draft requirement

* Every `actions[*.outputSchema]` and `triggers[*.outputSchema]` object must include a `$schema` key that points to a supported JSON Schema draft. We recommend using the canonical Draft 2020-12 identifier:

  ```json
  {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {}
  }
  ```

* Use the most specific draft that matches the features you need. Avoid vendor-specific or unpublished drafts so downstream tooling can interpret the schema consistently.
* Keep the schema representative of the actual API response. Add property descriptions and types when possible—the validator will ensure that the `$schema` key is present, but reviewers rely on accurate schemas to understand connector behaviour.

## Sample payload guidance

* Populate the `sample` field for every action and trigger with an object that matches the schema and demonstrates the primary fields a workflow author should expect.
* Remove personally identifiable information (PII) and any sensitive tokens or IDs. Use obviously fake placeholder values (e.g. `sample@example.com`) when you need to demonstrate format.
* Keep payloads reasonably small—include only the fields required to understand the response. Extremely large sample objects make the catalog harder to navigate and can slow down CI diffs.

## Local validation

Run the validator whenever you update a connector definition:

```bash
npm run check:connectors
```

The script will fail if any action or trigger is missing either `outputSchema.$schema` or a `sample`, and it enforces consistent runtime metadata at the same time.【F:scripts/validate-connectors.ts†L140-L177】 Fix the reported items before opening a pull request.
