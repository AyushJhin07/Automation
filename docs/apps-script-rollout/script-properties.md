# Apps Script Script Properties

This guide describes how Apps Script handlers should reference Script Properties, the naming conventions we enforce across connectors, and the source of truth the deployment tooling consumes. The lint rule in `scripts/verify-apps-script-properties.ts` keeps this document synchronized with the machine-readable report.

## Naming conventions

- Property names must be uppercase with underscores: `CONNECTOR_RESOURCE_TYPE`.
- Prefixes align with the connector identifier from `action.<connector>:<operation>` (for example, `slack` → `SLACK_...`, `salesforce` → `SALESFORCE_...`).
- Connectors with hyphenated identifiers use underscores when uppercased (for example, `google-drive` → `GOOGLE_DRIVE_...`).
- Avoid bespoke aliases; if a handler requires a new property prefix, update the connector manifest, this guide, and the JSON report in the same change.
- Shared system-level properties (like `WORKFLOW_LOGS` or `__VAULT_EXPORTS__`) are tracked in the allowlist within the lint script and do not need connector prefixes.

## Connector requirements

The table below is regenerated automatically. Required properties appear in the “Required properties” column. Optional properties include their default, when applicable. The “Environment notes” column highlights properties that toggle between sandbox and production environments (for example suffixes like `_ENVIRONMENT`, `_SANDBOX`, `_DOMAIN`, or `_INSTANCE_URL`).

<!-- BEGIN GENERATED APPS SCRIPT PROPERTIES -->

| Connector | Required properties | Optional properties | Environment notes |
| --- | --- | --- | --- |
| activecampaign | `ACTIVECAMPAIGN_API_KEY`<br>`ACTIVECAMPAIGN_API_URL` | — | — |
| adobe-acrobat | `ADOBE_PDF_CLIENT_ID`<br>`ADOBE_PDF_CLIENT_SECRET` | — | — |
| adobe-creative | `ADOBE_CREATIVE_ACCESS_TOKEN` | — | — |
| adobe-sign | `ADOBE_SIGN_ACCESS_TOKEN` | — | — |
| ADP Workforce Now | `ADP_ACCESS_TOKEN`<br>`ADP_CLIENT_ID`<br>`ADP_CLIENT_SECRET`<br>`ADP_COMPANY_CODES` | — | `ADP_COMPANY_CODES` accepts comma-separated codes when workflows span multiple company entities. |
| Adyen | `ADYEN_API_KEY`<br>`ADYEN_MERCHANT_ACCOUNT` | — | — |
| Airtable | `AIRTABLE_API_KEY`<br>`AIRTABLE_BASE_ID` | — | — |
| amazon | `AMAZON_ACCESS_KEY`<br>`AMAZON_SECRET_KEY` | — | — |
| amplitude | `AMPLITUDE_API_KEY` | — | — |
| animoto | `ANIMOTO_API_KEY` | — | — |
| asana | `ASANA_ACCESS_TOKEN` | — | — |
| aws-s3 | `AWS_ACCESS_KEY_ID`<br>`AWS_S3_BUCKET`<br>`AWS_SECRET_ACCESS_KEY` | — | — |
| BambooHR | `BAMBOOHR_API_KEY`<br>`BAMBOOHR_SUBDOMAIN` | — | `BAMBOOHR_SUBDOMAIN` |
| Basecamp | `BASECAMP_ACCESS_TOKEN` | — | — |
| BigCommerce | `BIGCOMMERCE_ACCESS_TOKEN`<br>`BIGCOMMERCE_STORE_HASH` | — | — |
| Bitbucket | `BITBUCKET_APP_PASSWORD`<br>`BITBUCKET_USERNAME` | — | — |
| Box | `BOX_ACCESS_TOKEN` | — | — |
| buffer | `BUFFER_ACCESS_TOKEN` | — | — |
| Calendly | `CALENDLY_ACCESS_TOKEN` | — | — |
| canva | `CANVA_API_KEY` | — | — |
| ClickUp | `CLICKUP_API_KEY` | — | — |
| constant-contact | `CONSTANT_CONTACT_ACCESS_TOKEN` | — | — |
| convertkit | `CONVERTKIT_API_KEY` | — | — |
| creately | `CREATELY_API_KEY` | — | — |
| Datadog | `DATADOG_API_KEY` | — | — |
| discord | `DISCORD_WEBHOOK_URL` | — | — |
| Docker Hub | `DOCKER_HUB_ACCESS_TOKEN`<br>`DOCKER_HUB_USERNAME` | — | — |
| DocuSign | `DOCUSIGN_ACCESS_TOKEN`<br>`DOCUSIGN_ACCOUNT_ID` | — | — |
| Dropbox | `DROPBOX_ACCESS_TOKEN` | — | — |
| drupal | `DRUPAL_PASSWORD`<br>`DRUPAL_SITE_URL`<br>`DRUPAL_USERNAME` | — | — |
| ebay | `EBAY_ACCESS_TOKEN` | — | — |
| etsy | `ETSY_ACCESS_TOKEN` | — | — |
| eversign | `EVERSIGN_ACCESS_KEY` | — | — |
| facebook | `FACEBOOK_ACCESS_TOKEN` | — | — |
| facebook-ads | `FACEBOOK_ADS_ACCESS_TOKEN`<br>`FACEBOOK_ADS_ACCOUNT_ID` | — | — |
| figma | `FIGMA_ACCESS_TOKEN` | — | — |
| flipboard | `FLIPBOARD_ACCESS_TOKEN` | — | — |
| freshbooks | `FRESHBOOKS_ACCESS_TOKEN` | — | — |
| Freshdesk | `FRESHDESK_API_KEY`<br>`FRESHDESK_DOMAIN` | — | `FRESHDESK_DOMAIN` |
| ghost | `GHOST_ADMIN_API_KEY`<br>`GHOST_API_URL` | — | — |
| GitHub | `GITHUB_ACCESS_TOKEN` *(repo scope)* | — | — |
| GitLab | `GITLAB_ACCESS_TOKEN` | — | — |
| Gmail | `GMAIL_ACCESS_TOKEN` | `GMAIL_REFRESH_TOKEN` | — |
| Gmail Enhanced | `GMAIL_ENHANCED_ACCESS_TOKEN` | — | — |
| Google Contacts | `GOOGLE_CONTACTS_ACCESS_TOKEN` | `GOOGLE_CONTACTS_OAUTH_SUBJECT` | — |
| google-ads | `GOOGLE_ADS_CUSTOMER_ID`<br>`GOOGLE_ADS_DEVELOPER_TOKEN` | — | — |
| google-analytics | `GA_VIEW_ID` | — | — |
| google-calendar | `GOOGLE_CALENDAR_ACCESS_TOKEN` | `GOOGLE_CALENDAR_DEFAULT_CALENDAR_ID` | — |
| google-cloud-storage | `GCS_BUCKET`<br>`GCS_SERVICE_ACCOUNT_KEY` | — | — |
| Google Docs | `GOOGLE_DOCS_ACCESS_TOKEN` *(Docs + Drive metadata scopes)* | — | — |
| Google Drive | `GOOGLE_DRIVE_ACCESS_TOKEN` | `GOOGLE_DRIVE_OAUTH_SUBJECT`<br>`GOOGLE_DRIVE_SERVICE_ACCOUNT` | — |
| Greenhouse | `GREENHOUSE_API_KEY` | — | — |
| HelloSign | `HELLOSIGN_API_KEY` | — | — |
| hootsuite | `HOOTSUITE_ACCESS_TOKEN` | — | — |
| HubSpot | `HUBSPOT_API_KEY` | — | — |
| ifttt | `IFTTT_WEBHOOK_KEY` | — | — |
| instagram | `INSTAGRAM_ACCESS_TOKEN` | — | — |
| Intercom | `INTERCOM_ACCESS_TOKEN` | — | — |
| invision | `INVISION_ACCESS_TOKEN` | — | — |
| Jenkins | `JENKINS_BASE_URL`<br>`JENKINS_TOKEN`<br>`JENKINS_USERNAME` | — | `JENKINS_BASE_URL` |
| Jira | `JIRA_API_TOKEN`<br>`JIRA_BASE_URL`<br>`JIRA_EMAIL` | — | `JIRA_BASE_URL` |
| Klaviyo | `KLAVIYO_API_KEY` | — | — |
| Kubernetes | `KUBERNETES_API_SERVER`<br>`KUBERNETES_BEARER_TOKEN` | — | — |
| later | `LATER_ACCESS_TOKEN` | — | — |
| linkedin | `LINKEDIN_ACCESS_TOKEN` | — | — |
| loom | `LOOM_ACCESS_TOKEN` | — | — |
| lucidchart | `LUCIDCHART_ACCESS_TOKEN` | — | — |
| Magento | `MAGENTO_ACCESS_TOKEN`<br>`MAGENTO_STORE_URL` | — | — |
| Mailchimp | `MAILCHIMP_API_KEY`<br>`MAILCHIMP_LIST_ID` | — | — |
| medium | `MEDIUM_ACCESS_TOKEN` | — | — |
| Microsoft Dynamics 365 | `DYNAMICS365_ACCESS_TOKEN`<br>`DYNAMICS365_INSTANCE_URL` | — | `DYNAMICS365_INSTANCE_URL` |
| Microsoft Outlook | `OUTLOOK_ACCESS_TOKEN` | — | — |
| Microsoft Teams | `TEAMS_WEBHOOK_URL` | — | — |
| Microsoft To Do | `MICROSOFT_TODO_ACCESS_TOKEN` | — | — |
| microsoft-excel | `MICROSOFT_EXCEL_ACCESS_TOKEN` | — | — |
| microsoft-powerpoint | `MICROSOFT_POWERPOINT_ACCESS_TOKEN` | — | — |
| microsoft-word | `MICROSOFT_WORD_ACCESS_TOKEN` | — | — |
| Miro | `MIRO_ACCESS_TOKEN` | — | — |
| Mixpanel | `MIXPANEL_PROJECT_TOKEN` | — | — |
| Monday.com | `MONDAY_API_KEY` | — | — |
| mongodb | `MONGODB_CONNECTION_STRING` | — | — |
| mysql | `MYSQL_CONNECTION_STRING` | — | — |
| new-relic | `NEWRELIC_ACCOUNT_ID`<br>`NEWRELIC_API_KEY` | — | — |
| Notion | `NOTION_ACCESS_TOKEN`<br>`NOTION_DATABASE_ID`<br>`NOTION_PAGE_ID` | — | — |
| OneDrive | `ONEDRIVE_ACCESS_TOKEN` | — | — |
| oracle | `ORACLE_CONNECTION_STRING` | — | — |
| pandadoc | `PANDADOC_API_KEY` | — | — |
| PayPal | `PAYPAL_CLIENT_ID`<br>`PAYPAL_CLIENT_SECRET` | — | — |
| pinterest | `PINTEREST_ACCESS_TOKEN` | — | — |
| Pipedrive | `PIPEDRIVE_API_TOKEN`<br>`PIPEDRIVE_COMPANY_DOMAIN` | — | `PIPEDRIVE_COMPANY_DOMAIN` |
| postgresql | `POSTGRESQL_CONNECTION_STRING` | — | — |
| powtoon | `POWTOON_API_KEY` | — | — |
| prezi | `PREZI_ACCESS_TOKEN` | — | — |
| QuickBooks | `QUICKBOOKS_ACCESS_TOKEN`<br>`QUICKBOOKS_COMPANY_ID` | — | — |
| reddit | `REDDIT_CLIENT_ID`<br>`REDDIT_CLIENT_SECRET` | — | — |
| redis | `REDIS_CONNECTION_STRING` | — | — |
| RingCentral | `RINGCENTRAL_ACCESS_TOKEN` | — | — |
| sage | `SAGE_API_KEY` | — | — |
| Salesforce | `SALESFORCE_ACCESS_TOKEN`<br>`SALESFORCE_INSTANCE_URL` | — | `SALESFORCE_INSTANCE_URL` |

Salesforce workflows must populate both properties before deployment. Access tokens expire within hours, so schedule a rotation that updates `SALESFORCE_ACCESS_TOKEN` and confirm the `SALESFORCE_INSTANCE_URL` matches the target tenant. The Apps Script runtime aborts the handler early when either property is missing.

| salesforce-commerce | `SFCC_ACCESS_TOKEN` | — | — |
| screencast-o-matic | `SCREENCAST_O_MATIC_API_KEY` | — | — |
| SendGrid | `SENDGRID_API_KEY` | — | — |
| ServiceNow | `SERVICENOW_INSTANCE`<br>`SERVICENOW_PASSWORD`<br>`SERVICENOW_USERNAME` | — | — |
| Shopify | `SHOPIFY_ACCESS_TOKEN`<br>`SHOPIFY_SHOP_DOMAIN` | — | `SHOPIFY_SHOP_DOMAIN` |
| signrequest | `SIGNREQUEST_TOKEN` | — | — |
| sketch | `SKETCH_API_KEY` | — | — |
| skype | `SKYPE_ACCESS_TOKEN` | — | — |
| Slack | `SLACK_BOT_TOKEN` (required), optional `SLACK_WEBHOOK_URL` | Bot OAuth token with `chat:write`, `channels:manage`, `channels:read`, `reactions:write`, `files:write`, `users:read`, and history scopes. Webhook URL can be supplied for legacy fallbacks. | `apps_script__slack__bot_token`, `apps_script__slack__webhook_url` |
| slideshare | `SLIDESHARE_API_KEY`<br>`SLIDESHARE_SHARED_SECRET` | — | — |
| sprout-social | `SPROUT_SOCIAL_ACCESS_TOKEN` | — | — |
| Square | `SQUARE_ACCESS_TOKEN` | — | — |
| Stripe | `STRIPE_SECRET_KEY` | `STRIPE_ACCOUNT_OVERRIDE` | — |
| substack | `SUBSTACK_API_KEY` | — | — |
| SurveyMonkey | `SURVEYMONKEY_ACCESS_TOKEN` | — | — |
| Teamwork | `TEAMWORK_API_TOKEN`<br>`TEAMWORK_SITE_URL` | — | `TEAMWORK_SITE_URL` |
| telegram | `TELEGRAM_BOT_TOKEN`<br>`TELEGRAM_CHAT_ID` | — | — |
| tiktok | `TIKTOK_ACCESS_TOKEN` | — | — |
| Toggl Track | `TOGGL_API_TOKEN` | — | — |
| Trello | `TRELLO_API_KEY`<br>`TRELLO_TOKEN` | — | — |
| Twilio | `TWILIO_ACCOUNT_SID`<br>`TWILIO_AUTH_TOKEN`<br>`TWILIO_FROM_NUMBER` | — | — |
| twitter | `TWITTER_BEARER_TOKEN` | — | — |
| Typeform | `TYPEFORM_ACCESS_TOKEN` | `TYPEFORM_LAST_FORM_ID` | — |
| vimeo | `VIMEO_ACCESS_TOKEN` | — | — |
| vonage | `VONAGE_API_KEY`<br>`VONAGE_API_SECRET` | — | — |
| wave | `WAVE_ACCESS_TOKEN` | — | — |
| Webflow | `WEBFLOW_API_TOKEN`<br>`WEBFLOW_DEFAULT_SITE_ID` | — | `WEBFLOW_DEFAULT_SITE_ID` |
| whatsapp | `WHATSAPP_ACCESS_TOKEN`<br>`WHATSAPP_PHONE_NUMBER_ID` | — | — |
| wistia | `WISTIA_API_KEY` | — | — |
| WooCommerce | `WOOCOMMERCE_CONSUMER_KEY`<br>`WOOCOMMERCE_CONSUMER_SECRET`<br>`WOOCOMMERCE_STORE_URL` | — | — |
| wordpress | `WORDPRESS_PASSWORD`<br>`WORDPRESS_SITE_URL`<br>`WORDPRESS_USERNAME` | — | — |
| Workday | `WORKDAY_PASSWORD`<br>`WORKDAY_USERNAME` | — | — |
| Workfront | `WORKFRONT_API_KEY`<br>`WORKFRONT_DOMAIN` | — | `WORKFRONT_DOMAIN` |
| Xero | `XERO_ACCESS_TOKEN` | — | — |
| youtube | `YOUTUBE_ACCESS_TOKEN` | — | — |
| zapier | `ZAPIER_WEBHOOK_URL` | — | — |
| Zendesk | `ZENDESK_API_TOKEN`<br>`ZENDESK_EMAIL`<br>`ZENDESK_SUBDOMAIN` | — | `ZENDESK_SUBDOMAIN` |
| Zoho Books | `ZOHO_BOOKS_AUTH_TOKEN` | — | — |
| Zoho CRM | `ZOHO_CRM_ACCESS_TOKEN` | — | — |
| zoom | `ZOOM_API_KEY`<br>`ZOOM_API_SECRET` | — | — |
| Zoom Enhanced | `ZOOM_ENHANCED_ACCESS_TOKEN` | `ZOOM_ENHANCED_CLIENT_ID`<br>`ZOOM_ENHANCED_CLIENT_SECRET`<br>`ZOOM_ENHANCED_ACCOUNT_ID`<br>`ZOOM_ENHANCED_JWT_TOKEN`<br>`ZOOM_ENHANCED_USER_ID`<br>`ZOOM_ENHANCED_DEFAULT_MEETING_ID`<br>`ZOOM_ENHANCED_DEFAULT_WEBINAR_ID` | — |

<!-- END GENERATED APPS SCRIPT PROPERTIES -->

### Zendesk authentication expectations

- `ZENDESK_SUBDOMAIN` must always resolve to the workspace host (e.g. `acme` for `https://acme.zendesk.com`). The handlers
  normalize values that include protocol or the full hostname, but omitting the subdomain prevents API calls entirely.
- Provide either an OAuth access token (recommended) via `requireOAuthToken('zendesk', { scopes: ['read', 'write'] })` **or**
  populate both `ZENDESK_API_TOKEN` and `ZENDESK_EMAIL`. When OAuth is unavailable the email/token pair authenticates using
  Zendesk's API token scheme.

### Stripe account overrides

- `STRIPE_SECRET_KEY` authenticates API requests and must be present before deploying the handler.
- `STRIPE_ACCOUNT_OVERRIDE` is optional and, when set, supplies the `Stripe-Account` header so Connect workflows can target a specific child account.

### Gmail token management

- Apps Script Gmail handlers require `GMAIL_ACCESS_TOKEN` scopes `https://www.googleapis.com/auth/gmail.send`, `https://www.googleapis.com/auth/gmail.readonly`, **and** `https://www.googleapis.com/auth/gmail.modify` so the same token can poll, send, and update labels. Provision the access token with the full trio of scopes before promoting new handlers.
- Populate `GMAIL_REFRESH_TOKEN` alongside the access token. A rotation job should exchange the refresh token at least daily; the Apps Script runtime expects fresh access tokens because Gmail REST calls fail once the one-hour access token expires.
- Store both secrets in Script Properties (production and staging) before deploying new handlers. Missing tokens cause structured `gmail_missing_access_token` errors during runtime, surfacing misconfigurations quickly.
- Polling triggers persist their `runtime.state` cursor back to Script Properties; confirm Script Properties writes succeed in staging before the Tier‑0 rollout so trigger runs continue from the last `internalDate` checkpoint.

### Gmail Enhanced token management

- Enhanced Gmail handlers call `requireOAuthToken('gmail-enhanced', { scopes: [...] })` at runtime. Provision `GMAIL_ENHANCED_ACCESS_TOKEN` with scopes `https://www.googleapis.com/auth/gmail.modify`, `https://www.googleapis.com/auth/gmail.labels`, `openid`, `email`, and `profile` so the same credential can send messages, manage labels, and hydrate profile data.
- Populate the enhanced token in Script Properties for every environment (staging, production) before enabling handlers. Missing secrets surface as `gmail_enhanced_missing_access_token` log events and cause immediate failures.
- The generated polling triggers persist their cursor back into Script Properties using the enhanced connector key. Verify writes succeed during staging smoke tests so subsequent runs resume from the last Gmail `internalDate` checkpoint.

### Google Contacts People API access

- Issue `GOOGLE_CONTACTS_ACCESS_TOKEN` with the `https://www.googleapis.com/auth/contacts` scope so the same credential can read and mutate contacts across all handlers.
- When using domain-wide delegation, populate `GOOGLE_CONTACTS_OAUTH_SUBJECT` with the delegated user's primary email before deployment. The Apps Script runtime includes that subject automatically so Google issues tokens on behalf of the impersonated account.

## Machine-readable report

Deployment tooling and Confluence dashboards rely on `production/reports/apps-script-properties.json`. Run `tsx scripts/verify-apps-script-properties.ts --write` after updating REAL_OPS handlers or connector manifests so the report and table stay in sync. CI will fail if the report or guide drifts from the generated output.

## Environment considerations

- Populate environment toggles (`*_ENVIRONMENT`, `*_SANDBOX`, `*_DOMAIN`, `*_INSTANCE_URL`, etc.) in both staging and production property stores. Missing overrides default to the value encoded in the handler template (see defaults in the optional column).
- Secrets sourced from Vault exports must still follow the naming rules above to support sealed credential bundles.
- When adding new environment-sensitive properties, document the expected values in the connector runbook and update both this guide and the JSON report using the lint script’s `--write` mode.
