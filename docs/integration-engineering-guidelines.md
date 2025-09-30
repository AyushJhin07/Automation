# Integration Engineering Guidelines

These guidelines standardize how we implement, test, and launch new connector clients on the automation platform. Every
connector that graduates to "implemented" status **must** satisfy each checklist item before the manifest in
`server/integrations/supportedApps.ts` is updated.

## 1. Authentication & Configuration
- Document the connector's credential schema (OAuth, API key, basic auth, etc.) and align it with the JSON definition in
  `/connectors/<app>.json`.
- Normalize credential field names (for example, always map external `access_token` to `credentials.accessToken`).
- If the API requires additional context (e.g., Shopify `shopDomain`), accept it through the `additionalConfig` map and
  validate up front.
- Provide helpers for token refresh, signature verification, and webhook registration when the platform requires them.

## 2. HTTP Client Expectations
- Extend `BaseAPIClient` and pass the canonical API base URL to `super()`.
- Use the `get`, `post`, `put`, `delete`, and `patch` helpers instead of calling `fetch` directly so rate-limiting and
  error handling stay centralized.
- When the API needs form-encoded or multipart payloads, build the correct body type (`URLSearchParams`, `FormData`) and
  let `BaseAPIClient` set headers automatically.
- Populate custom headers (versioning, account IDs) within `getAuthHeaders()` rather than duplicating logic per request.

## 3. Pagination & Rate Limits
- Implement pagination helpers for each API family (cursor-based, offset-based, time-based) and expose them as reusable
  methods.
- Update `this.rateLimitInfo` based on response headers so the shared throttle logic can delay requests automatically.
- Add explicit safeguards for hard API limits (daily quotas, concurrency caps) and surface actionable error messages.

## 4. Error Handling & Logging
- Normalize API errors into `{ success: false, error: string, data?: any }` objects; include upstream error codes where
  available.
- Throw descriptive errors from credential validators so users receive immediate feedback during connection setup.
- Log unexpected HTTP statuses with the connector ID and request metadata to simplify production debugging (respecting
  sensitive-data redaction guidelines).

## 5. Workflow Function Mapping
- Wire each connector function ID (e.g., `twilio.send_sms`) to a method on the client via
  `IntegrationManager.executeFunctionOnClient`.
- Ensure parameter normalization aligns with the JSON contract so workflow authors receive helpful validation errors.
- Provide unit tests for critical parameter transforms when the mapping logic is complex.

## 6. Testing Strategy
- Add integration tests that instantiate the client with mocked credentials and use HTTP fixtures where possible.
- Cover at least one success-path action and one failure-path scenario per connector, exercising retries or validation.
- Include connection-test coverage (`testConnection`) so regression suites catch credential or permission regressions.

## 7. Documentation & Release Readiness
- Update the connector's markdown documentation (if present) with setup steps, required scopes, and supported actions.
- Submit a changelog entry summarizing new capabilities and any breaking changes.
- Ensure the connector is registered in `ConnectorRegistry.initializeAPIClients()` and appears in the manifest when all
  requirements pass.

## 8. Operational Ownership
- Define on-call ownership for the connector and add monitoring dashboards where applicable.
- Document escalation paths for third-party incidents or API deprecations.
- Schedule periodic audits (at least quarterly) to revalidate authentication flows, pagination behavior, and error
  handling against upstream API changes.

Following these practices keeps every connector consistent, debuggable, and production-ready as we expand coverage across
all catalog applications.
