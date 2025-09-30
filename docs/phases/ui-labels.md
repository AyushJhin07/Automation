# Connector UI Labels — Status Semantics

Labels (derived server-side and exposed in /api/connectors):

- Stable: availability = stable AND hasImplementation = true
- Coming Soon: availability = stable AND hasImplementation = false
- Experimental: availability = experimental (regardless of implementation)

Notes

- JSON definitions currently mark most connectors as `availability: stable`. Until implementation exists, these will appear as `Coming Soon` to set correct expectations.
- The server now returns `statusLabel` per connector alongside `hasImplementation` and `availability`.
- Webhook presence is exposed as `hasWebhooks` using explicit trigger metadata if present; otherwise inferred for well-known vendors.

