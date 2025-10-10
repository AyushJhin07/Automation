# Connector runtime availability

This catalog tracks whether each connector in the Automation platform is ready to execute inside the Node.js sandbox, the Apps Script sandbox, or both. It is sourced from the runtime declarations that live in every connector manifest (`connectors/*/definition.json`). Use this document during release readiness reviews to spot gaps quickly and to confirm that new manifests publish the correct runtime metadata.

## How to update this report

1. Run the runtime readiness script to regenerate a fresh CSV/console snapshot:
   ```bash
   npm run report:runtime
   ```
   The script walks every connector manifest, merges action and trigger declarations, and prints the runtime status that the workflow editor will expose in-product.
2. If you need to export an updated Markdown table for this document, you can adapt the script above or run a quick Node.js helper that writes the same dataset to a file. (Example helper shown below.)
3. Commit the regenerated table alongside any connector changes so downstream teams see the new coverage in the same pull request.

> _Example helper (run from the repo root):_
> ```bash
> node <<'NODE'
> import { promises as fs } from 'fs';
> import path from 'path';
> const connectorsDir = path.resolve('connectors');
> const rows = [];
> for (const entry of await fs.readdir(connectorsDir, { withFileTypes: true })) {
>   if (!entry.isDirectory()) continue;
>   const defPath = path.join(connectorsDir, entry.name, 'definition.json');
>   try {
>     const def = JSON.parse(await fs.readFile(defPath, 'utf8'));
>     const ops = [...(def.actions ?? []), ...(def.triggers ?? [])];
>     if (ops.length === 0) continue;
>     const total = ops.length;
>     const node = ops.filter(op => op?.runtimes?.includes('node')).length;
>     const apps = ops.filter(op => op?.runtimes?.includes('appsScript')).length;
>     const status = (count) => count === total ? '✅ Full' : count === 0 ? '❌ None' : `⚠️ Partial (${count}/${total})`;
>     console.log(`| ${def.name ?? entry.name} | ${total} | ${status(node)} | ${status(apps)} |`);
>   } catch (error) {
>     if (error.code !== 'ENOENT') throw error;
>   }
> }
> NODE
> ```
> (The helper mirrors the iteration performed in `scripts/connector-runtime-status.ts` and prints Markdown rows. Keeping the logic in code avoids transcription mistakes.)

## Platform summary

- **Apps Script coverage:** 149 connectors publish Apps Script runtimes for every operation today, making them fully compatible with the Apps Script executor.【F:scripts/connector-runtime-status.ts†L24-L113】
- **Node.js coverage:** 10 connectors offer full Node.js runtime support, 1 connector (Google Docs) is partially covered (5 of 12 operations), and the remaining 138 connectors have not yet enabled the Node.js sandbox.【F:scripts/connector-runtime-status.ts†L24-L113】
- **Highest priority for Node.js parity:** Airtable, GitHub, Gmail, Google Drive, Google Sheets Enhanced, HubSpot, Notion, Shopify, Slack, and Stripe already deliver complete Node.js parity. Focus upcoming Node.js enablement work on the long tail of connectors still marked as “❌ None,” starting with Google Docs to finish its remaining operations.【F:connectors/google-docs/definition.json†L45-L619】【F:connectors/slack/definition.json†L90-L427】

## Connector matrix

The table below is sorted alphabetically by connector name. “✅ Full” means every action and trigger in the connector supports that runtime. “⚠️ Partial” indicates a mix of supported and unsupported operations, with the ratio shown in parentheses. “❌ None” means the runtime is entirely unavailable today.

| Connector | Total Ops | Node.js | Apps Script |
| --- | --- | --- | --- |
| Adobe Acrobat Sign | 7 | ❌ None | ✅ Full |
| Adobe Workfront | 16 | ❌ None | ✅ Full |
| ADP Workforce Now | 5 | ❌ None | ✅ Full |
| Adyen | 5 | ❌ None | ✅ Full |
| Airtable | 8 | ✅ Full | ✅ Full |
| Airtable Enhanced | 10 | ❌ None | ✅ Full |
| Ansible | 9 | ❌ None | ✅ Full |
| Argo CD | 7 | ❌ None | ✅ Full |
| Asana Enhanced | 15 | ❌ None | ✅ Full |
| Atlassian Confluence | 10 | ❌ None | ✅ Full |
| AWS CloudFormation | 7 | ❌ None | ✅ Full |
| AWS CodePipeline | 8 | ❌ None | ✅ Full |
| Azure DevOps | 7 | ❌ None | ✅ Full |
| BambooHR | 7 | ❌ None | ✅ Full |
| Basecamp | 8 | ❌ None | ✅ Full |
| BigCommerce | 8 | ❌ None | ✅ Full |
| Bitbucket | 8 | ❌ None | ✅ Full |
| Box | 10 | ❌ None | ✅ Full |
| Braze | 8 | ❌ None | ✅ Full |
| Brex | 10 | ❌ None | ✅ Full |
| Cal.com | 10 | ❌ None | ✅ Full |
| Calendly | 8 | ❌ None | ✅ Full |
| CircleCI | 10 | ❌ None | ✅ Full |
| Cisco Webex | 13 | ❌ None | ✅ Full |
| ClickUp | 11 | ❌ None | ✅ Full |
| Coda | 11 | ❌ None | ✅ Full |
| Coupa | 10 | ❌ None | ✅ Full |
| Databricks | 12 | ❌ None | ✅ Full |
| Datadog | 9 | ❌ None | ✅ Full |
| Docker Hub | 7 | ❌ None | ✅ Full |
| DocuSign | 11 | ❌ None | ✅ Full |
| Dropbox | 13 | ❌ None | ✅ Full |
| Dropbox Enhanced | 14 | ❌ None | ✅ Full |
| Egnyte | 12 | ❌ None | ✅ Full |
| Expensify | 11 | ❌ None | ✅ Full |
| Freshdesk | 10 | ❌ None | ✅ Full |
| GitHub | 20 | ✅ Full | ✅ Full |
| GitHub Enhanced | 11 | ❌ None | ✅ Full |
| GitLab | 7 | ❌ None | ✅ Full |
| Gmail | 10 | ✅ Full | ✅ Full |
| Gmail Enhanced | 12 | ❌ None | ✅ Full |
| Google Admin | 11 | ❌ None | ✅ Full |
| Google BigQuery | 8 | ❌ None | ✅ Full |
| Google Calendar | 16 | ❌ None | ✅ Full |
| Google Chat | 14 | ❌ None | ✅ Full |
| Google Contacts | 11 | ❌ None | ✅ Full |
| Google Docs | 12 | ⚠️ Partial (5/12) | ✅ Full |
| Google Drive | 18 | ✅ Full | ✅ Full |
| Google Forms | 12 | ❌ None | ✅ Full |
| Google Meet | 13 | ❌ None | ✅ Full |
| Google Sheets Enhanced | 14 | ✅ Full | ✅ Full |
| Google Slides | 12 | ❌ None | ✅ Full |
| Grafana | 7 | ❌ None | ✅ Full |
| Greenhouse | 15 | ❌ None | ✅ Full |
| Guru | 15 | ❌ None | ✅ Full |
| HashiCorp Vault | 7 | ❌ None | ✅ Full |
| HelloSign | 16 | ❌ None | ✅ Full |
| Helm | 7 | ❌ None | ✅ Full |
| HubSpot | 19 | ✅ Full | ✅ Full |
| HubSpot Enhanced | 16 | ❌ None | ✅ Full |
| Intercom | 16 | ❌ None | ✅ Full |
| Iterable | 18 | ❌ None | ✅ Full |
| Jenkins | 19 | ❌ None | ✅ Full |
| Jira | 16 | ❌ None | ✅ Full |
| Jira Service Management | 19 | ❌ None | ✅ Full |
| JotForm | 18 | ❌ None | ✅ Full |
| Klaviyo | 15 | ❌ None | ✅ Full |
| Kubernetes | 7 | ❌ None | ✅ Full |
| Kustomer | 18 | ❌ None | ✅ Full |
| Lever | 15 | ❌ None | ✅ Full |
| Linear | 15 | ❌ None | ✅ Full |
| LLM (Large Language Model) | 3 | ❌ None | ✅ Full |
| Looker | 16 | ❌ None | ✅ Full |
| Luma | 17 | ❌ None | ✅ Full |
| Magento | 11 | ❌ None | ✅ Full |
| Mailchimp | 18 | ❌ None | ✅ Full |
| Mailchimp Enhanced | 14 | ❌ None | ✅ Full |
| Mailgun | 19 | ❌ None | ✅ Full |
| Marketo | 21 | ❌ None | ✅ Full |
| Microsoft Dynamics 365 | 11 | ❌ None | ✅ Full |
| Microsoft Excel Online | 13 | ❌ None | ✅ Full |
| Microsoft Outlook | 11 | ❌ None | ✅ Full |
| Microsoft Teams | 12 | ❌ None | ✅ Full |
| Microsoft To Do | 10 | ❌ None | ✅ Full |
| Miro | 19 | ❌ None | ✅ Full |
| Mixpanel | 20 | ❌ None | ✅ Full |
| Monday.com | 18 | ❌ None | ✅ Full |
| Monday.com Enhanced | 14 | ❌ None | ✅ Full |
| Navan | 7 | ❌ None | ✅ Full |
| NetSuite | 7 | ❌ None | ✅ Full |
| New Relic | 8 | ❌ None | ✅ Full |
| Notion | 13 | ✅ Full | ✅ Full |
| Notion Enhanced | 21 | ❌ None | ✅ Full |
| Okta | 18 | ❌ None | ✅ Full |
| OneDrive | 8 | ❌ None | ✅ Full |
| Opsgenie | 14 | ❌ None | ✅ Full |
| PagerDuty | 15 | ❌ None | ✅ Full |
| Pardot | 8 | ❌ None | ✅ Full |
| PayPal | 12 | ❌ None | ✅ Full |
| Pipedrive | 12 | ❌ None | ✅ Full |
| Power BI | 9 | ❌ None | ✅ Full |
| Power BI Enhanced | 22 | ❌ None | ✅ Full |
| Prometheus | 7 | ❌ None | ✅ Full |
| Qualtrics | 10 | ❌ None | ✅ Full |
| QuickBooks | 17 | ❌ None | ✅ Full |
| Ramp | 6 | ❌ None | ✅ Full |
| Razorpay | 8 | ❌ None | ✅ Full |
| RingCentral | 10 | ❌ None | ✅ Full |
| Sage Intacct | 9 | ❌ None | ✅ Full |
| Salesforce | 6 | ❌ None | ✅ Full |
| Salesforce Enhanced | 10 | ❌ None | ✅ Full |
| SAP Ariba | 17 | ❌ None | ✅ Full |
| SAP Concur | 9 | ❌ None | ✅ Full |
| SAP SuccessFactors | 7 | ❌ None | ✅ Full |
| SendGrid | 10 | ❌ None | ✅ Full |
| Sentry | 21 | ❌ None | ✅ Full |
| ServiceNow | 8 | ❌ None | ✅ Full |
| SharePoint | 18 | ❌ None | ✅ Full |
| Shopify | 18 | ✅ Full | ✅ Full |
| Shopify Enhanced | 14 | ❌ None | ✅ Full |
| Slab | 10 | ❌ None | ✅ Full |
| Slack | 16 | ✅ Full | ✅ Full |
| Slack Enhanced | 18 | ❌ None | ✅ Full |
| Smartsheet | 17 | ❌ None | ✅ Full |
| Snowflake | 16 | ❌ None | ✅ Full |
| SonarQube | 7 | ❌ None | ✅ Full |
| Sonatype Nexus | 7 | ❌ None | ✅ Full |
| Square | 10 | ❌ None | ✅ Full |
| Stripe | 14 | ✅ Full | ✅ Full |
| Stripe Enhanced | 7 | ❌ None | ✅ Full |
| SurveyMonkey | 17 | ❌ None | ✅ Full |
| Tableau | 18 | ❌ None | ✅ Full |
| Talkdesk | 17 | ❌ None | ✅ Full |
| Teamwork | 18 | ❌ None | ✅ Full |
| Terraform Cloud | 7 | ❌ None | ✅ Full |
| Toggl Track | 21 | ❌ None | ✅ Full |
| Trello | 24 | ❌ None | ✅ Full |
| Trello Enhanced | 12 | ❌ None | ✅ Full |
| Twilio | 15 | ❌ None | ✅ Full |
| Typeform | 2 | ❌ None | ✅ Full |
| VictorOps | 15 | ❌ None | ✅ Full |
| Webflow | 18 | ❌ None | ✅ Full |
| WooCommerce | 10 | ❌ None | ✅ Full |
| Workday | 17 | ❌ None | ✅ Full |
| Xero | 16 | ❌ None | ✅ Full |
| Zendesk | 21 | ❌ None | ✅ Full |
| Zoho Books | 16 | ❌ None | ✅ Full |
| Zoho CRM | 13 | ❌ None | ✅ Full |
| Zoom Enhanced | 12 | ❌ None | ✅ Full |