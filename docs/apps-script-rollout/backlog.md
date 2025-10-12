# Apps Script Rollout Backlog

This backlog is generated from `server/connector-manifest.json` and `docs/apps-script-rollout/prioritization.csv`. Run `node scripts/generate-apps-script-backlog.mjs --write` after updating either source.

<!-- BEGIN BACKLOG:JSON -->
```json
{
  "generatedAt": "2025-10-03T08:25:23.579Z",
  "connectors": [
    {
      "id": "gmail",
      "name": "Gmail",
      "tier": 0,
      "plannedSquadOwner": "Workspace Platform",
      "targetSprint": "2025.05",
      "manifestPath": "connectors/gmail/manifest.json",
      "definitionPath": "connectors/gmail/definition.json",
      "testPath": "server/workflow/__tests__/WorkflowRuntime.gmail.integration.test.ts",
      "totalOperations": 10,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "google-calendar",
      "name": "Google Calendar",
      "tier": 0,
      "plannedSquadOwner": "Workspace Platform",
      "targetSprint": "2025.06",
      "manifestPath": "connectors/google-calendar/manifest.json",
      "definitionPath": "connectors/google-calendar/definition.json",
      "testPath": null,
      "totalOperations": 16,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "google-docs",
      "name": "Google Docs",
      "tier": 0,
      "plannedSquadOwner": "Workspace Platform",
      "targetSprint": "2025.06",
      "manifestPath": "connectors/google-docs/manifest.json",
      "definitionPath": "connectors/google-docs/definition.json",
      "testPath": null,
      "totalOperations": 12,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "google-drive",
      "name": "Google Drive",
      "tier": 0,
      "plannedSquadOwner": "Workspace Platform",
      "targetSprint": "2025.06",
      "manifestPath": "connectors/google-drive/manifest.json",
      "definitionPath": "connectors/google-drive/definition.json",
      "testPath": null,
      "totalOperations": 18,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "google-forms",
      "name": "Google Forms",
      "tier": 0,
      "plannedSquadOwner": "Workspace Platform",
      "targetSprint": "2025.07",
      "manifestPath": "connectors/google-forms/manifest.json",
      "definitionPath": "connectors/google-forms/definition.json",
      "testPath": null,
      "totalOperations": 12,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "google-sheets-enhanced",
      "name": "Google Sheets Enhanced",
      "tier": 0,
      "plannedSquadOwner": "Workspace Platform",
      "targetSprint": "2025.05",
      "manifestPath": "connectors/google-sheets-enhanced/manifest.json",
      "definitionPath": "connectors/google-sheets-enhanced/definition.json",
      "testPath": null,
      "totalOperations": 14,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "salesforce-enhanced",
      "name": "Salesforce Enhanced",
      "tier": 0,
      "plannedSquadOwner": "Revenue Automation",
      "targetSprint": "2025.07",
      "manifestPath": "connectors/salesforce-enhanced/manifest.json",
      "definitionPath": "connectors/salesforce-enhanced/definition.json",
      "testPath": null,
      "totalOperations": 10,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "slack",
      "name": "Slack",
      "tier": 0,
      "plannedSquadOwner": "Collaboration Core",
      "targetSprint": "2025.05",
      "manifestPath": "connectors/slack/manifest.json",
      "definitionPath": "connectors/slack/definition.json",
      "testPath": null,
      "totalOperations": 16,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "hubspot",
      "name": "HubSpot",
      "tier": 1,
      "plannedSquadOwner": "Revenue Automation",
      "targetSprint": "2025.08",
      "manifestPath": "connectors/hubspot/manifest.json",
      "definitionPath": "connectors/hubspot/definition.json",
      "testPath": null,
      "totalOperations": 19,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "outlook",
      "name": "Microsoft Outlook",
      "tier": 1,
      "plannedSquadOwner": "Collaboration Core",
      "targetSprint": "2025.08",
      "manifestPath": "connectors/outlook/manifest.json",
      "definitionPath": "connectors/outlook/definition.json",
      "testPath": null,
      "totalOperations": 11,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "microsoft-teams",
      "name": "Microsoft Teams",
      "tier": 1,
      "plannedSquadOwner": "Collaboration Core",
      "targetSprint": "2025.08",
      "manifestPath": "connectors/microsoft-teams/manifest.json",
      "definitionPath": "connectors/microsoft-teams/definition.json",
      "testPath": null,
      "totalOperations": 12,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "notion",
      "name": "Notion",
      "tier": 1,
      "plannedSquadOwner": "Knowledge Workflows",
      "targetSprint": "2025.10",
      "manifestPath": "connectors/notion/manifest.json",
      "definitionPath": "connectors/notion/definition.json",
      "testPath": null,
      "totalOperations": 13,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "onedrive",
      "name": "OneDrive",
      "tier": 1,
      "plannedSquadOwner": "Collaboration Core",
      "targetSprint": "2025.09",
      "manifestPath": "connectors/onedrive/manifest.json",
      "definitionPath": "connectors/onedrive/definition.json",
      "testPath": null,
      "totalOperations": 8,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "quickbooks",
      "name": "QuickBooks",
      "tier": 1,
      "plannedSquadOwner": "Finance Automations",
      "targetSprint": "2025.09",
      "manifestPath": "connectors/quickbooks/manifest.json",
      "definitionPath": "connectors/quickbooks/definition.json",
      "testPath": null,
      "totalOperations": 17,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "shopify",
      "name": "Shopify",
      "tier": 1,
      "plannedSquadOwner": "Commerce Integrations",
      "targetSprint": "2025.10",
      "manifestPath": "connectors/shopify/manifest.json",
      "definitionPath": "connectors/shopify/definition.json",
      "testPath": null,
      "totalOperations": 18,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "stripe",
      "name": "Stripe",
      "tier": 1,
      "plannedSquadOwner": "Finance Automations",
      "targetSprint": "2025.10",
      "manifestPath": "connectors/stripe/manifest.json",
      "definitionPath": "connectors/stripe/definition.json",
      "testPath": null,
      "totalOperations": 14,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "stripe-enhanced",
      "name": "Stripe Enhanced",
      "tier": 1,
      "plannedSquadOwner": "Finance Automations",
      "targetSprint": "2025.10",
      "manifestPath": "connectors/stripe-enhanced/manifest.json",
      "definitionPath": "connectors/stripe-enhanced/definition.json",
      "testPath": null,
      "totalOperations": 7,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "trello",
      "name": "Trello",
      "tier": 1,
      "plannedSquadOwner": "Productivity Enablement",
      "targetSprint": "2025.09",
      "manifestPath": "connectors/trello/manifest.json",
      "definitionPath": "connectors/trello/definition.json",
      "testPath": null,
      "totalOperations": 24,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "zendesk",
      "name": "Zendesk",
      "tier": 1,
      "plannedSquadOwner": "Support Ops",
      "targetSprint": "2025.09",
      "manifestPath": "connectors/zendesk/manifest.json",
      "definitionPath": "connectors/zendesk/definition.json",
      "testPath": null,
      "totalOperations": 21,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "adobesign",
      "name": "Adobe Acrobat Sign",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/adobesign/manifest.json",
      "definitionPath": "connectors/adobesign/definition.json",
      "testPath": null,
      "totalOperations": 7,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "workfront",
      "name": "Adobe Workfront",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/workfront/manifest.json",
      "definitionPath": "connectors/workfront/definition.json",
      "testPath": null,
      "totalOperations": 16,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "adp",
      "name": "ADP Workforce Now",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/adp/manifest.json",
      "definitionPath": "connectors/adp/definition.json",
      "testPath": null,
      "totalOperations": 5,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "adyen",
      "name": "Adyen",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/adyen/manifest.json",
      "definitionPath": "connectors/adyen/definition.json",
      "testPath": null,
      "totalOperations": 5,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "airtable",
      "name": "Airtable",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/airtable/manifest.json",
      "definitionPath": "connectors/airtable/definition.json",
      "testPath": null,
      "totalOperations": 8,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "airtable-enhanced",
      "name": "Airtable Enhanced",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/airtable-enhanced/manifest.json",
      "definitionPath": "connectors/airtable-enhanced/definition.json",
      "testPath": null,
      "totalOperations": 10,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "ansible",
      "name": "Ansible",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/ansible/manifest.json",
      "definitionPath": "connectors/ansible/definition.json",
      "testPath": null,
      "totalOperations": 9,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "argocd",
      "name": "Argo CD",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/argocd/manifest.json",
      "definitionPath": "connectors/argocd/definition.json",
      "testPath": null,
      "totalOperations": 7,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "asana-enhanced",
      "name": "Asana Enhanced",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/asana-enhanced/manifest.json",
      "definitionPath": "connectors/asana-enhanced/definition.json",
      "testPath": null,
      "totalOperations": 15,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "confluence",
      "name": "Atlassian Confluence",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/confluence/manifest.json",
      "definitionPath": "connectors/confluence/definition.json",
      "testPath": null,
      "totalOperations": 10,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "aws-cloudformation",
      "name": "AWS CloudFormation",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/aws-cloudformation/manifest.json",
      "definitionPath": "connectors/aws-cloudformation/definition.json",
      "testPath": null,
      "totalOperations": 7,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "aws-codepipeline",
      "name": "AWS CodePipeline",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/aws-codepipeline/manifest.json",
      "definitionPath": "connectors/aws-codepipeline/definition.json",
      "testPath": null,
      "totalOperations": 8,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "azure-devops",
      "name": "Azure DevOps",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/azure-devops/manifest.json",
      "definitionPath": "connectors/azure-devops/definition.json",
      "testPath": null,
      "totalOperations": 7,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "bamboohr",
      "name": "BambooHR",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/bamboohr/manifest.json",
      "definitionPath": "connectors/bamboohr/definition.json",
      "testPath": null,
      "totalOperations": 7,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "basecamp",
      "name": "Basecamp",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/basecamp/manifest.json",
      "definitionPath": "connectors/basecamp/definition.json",
      "testPath": null,
      "totalOperations": 8,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "bigcommerce",
      "name": "BigCommerce",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/bigcommerce/manifest.json",
      "definitionPath": "connectors/bigcommerce/definition.json",
      "testPath": null,
      "totalOperations": 8,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "bitbucket",
      "name": "Bitbucket",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/bitbucket/manifest.json",
      "definitionPath": "connectors/bitbucket/definition.json",
      "testPath": null,
      "totalOperations": 8,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "box",
      "name": "Box",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/box/manifest.json",
      "definitionPath": "connectors/box/definition.json",
      "testPath": "server/runtime/__tests__/ProcessSandboxExecutor.resourceLimits.test.ts",
      "totalOperations": 10,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "braze",
      "name": "Braze",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/braze/manifest.json",
      "definitionPath": "connectors/braze/definition.json",
      "testPath": null,
      "totalOperations": 8,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "brex",
      "name": "Brex",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/brex/manifest.json",
      "definitionPath": "connectors/brex/definition.json",
      "testPath": null,
      "totalOperations": 10,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "caldotcom",
      "name": "Cal.com",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/caldotcom/manifest.json",
      "definitionPath": "connectors/caldotcom/definition.json",
      "testPath": null,
      "totalOperations": 10,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "calendly",
      "name": "Calendly",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/calendly/manifest.json",
      "definitionPath": "connectors/calendly/definition.json",
      "testPath": null,
      "totalOperations": 8,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "circleci",
      "name": "CircleCI",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/circleci/manifest.json",
      "definitionPath": "connectors/circleci/definition.json",
      "testPath": null,
      "totalOperations": 10,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "webex",
      "name": "Cisco Webex",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/webex/manifest.json",
      "definitionPath": "connectors/webex/definition.json",
      "testPath": null,
      "totalOperations": 13,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "clickup",
      "name": "ClickUp",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/clickup/manifest.json",
      "definitionPath": "connectors/clickup/definition.json",
      "testPath": null,
      "totalOperations": 11,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "coda",
      "name": "Coda",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/coda/manifest.json",
      "definitionPath": "connectors/coda/definition.json",
      "testPath": null,
      "totalOperations": 11,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "coupa",
      "name": "Coupa",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/coupa/manifest.json",
      "definitionPath": "connectors/coupa/definition.json",
      "testPath": null,
      "totalOperations": 10,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "databricks",
      "name": "Databricks",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/databricks/manifest.json",
      "definitionPath": "connectors/databricks/definition.json",
      "testPath": null,
      "totalOperations": 12,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "datadog",
      "name": "Datadog",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/datadog/manifest.json",
      "definitionPath": "connectors/datadog/definition.json",
      "testPath": null,
      "totalOperations": 9,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "docker-hub",
      "name": "Docker Hub",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/docker-hub/manifest.json",
      "definitionPath": "connectors/docker-hub/definition.json",
      "testPath": null,
      "totalOperations": 7,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "docusign",
      "name": "DocuSign",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/docusign/manifest.json",
      "definitionPath": "connectors/docusign/definition.json",
      "testPath": null,
      "totalOperations": 11,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "dropbox",
      "name": "Dropbox",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/dropbox/manifest.json",
      "definitionPath": "connectors/dropbox/definition.json",
      "testPath": null,
      "totalOperations": 13,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "dropbox-enhanced",
      "name": "Dropbox Enhanced",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/dropbox-enhanced/manifest.json",
      "definitionPath": "connectors/dropbox-enhanced/definition.json",
      "testPath": null,
      "totalOperations": 14,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "egnyte",
      "name": "Egnyte",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/egnyte/manifest.json",
      "definitionPath": "connectors/egnyte/definition.json",
      "testPath": null,
      "totalOperations": 12,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "expensify",
      "name": "Expensify",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/expensify/manifest.json",
      "definitionPath": "connectors/expensify/definition.json",
      "testPath": null,
      "totalOperations": 11,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "freshdesk",
      "name": "Freshdesk",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/freshdesk/manifest.json",
      "definitionPath": "connectors/freshdesk/definition.json",
      "testPath": null,
      "totalOperations": 10,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "github",
      "name": "GitHub",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/github/manifest.json",
      "definitionPath": "connectors/github/definition.json",
      "testPath": null,
      "totalOperations": 20,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "github-enhanced",
      "name": "GitHub Enhanced",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/github-enhanced/manifest.json",
      "definitionPath": "connectors/github-enhanced/definition.json",
      "testPath": null,
      "totalOperations": 11,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "gitlab",
      "name": "GitLab",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/gitlab/manifest.json",
      "definitionPath": "connectors/gitlab/definition.json",
      "testPath": null,
      "totalOperations": 7,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "gmail-enhanced",
      "name": "Gmail Enhanced",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/gmail-enhanced/manifest.json",
      "definitionPath": "connectors/gmail-enhanced/definition.json",
      "testPath": null,
      "totalOperations": 12,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "google-admin",
      "name": "Google Admin",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/google-admin/manifest.json",
      "definitionPath": "connectors/google-admin/definition.json",
      "testPath": null,
      "totalOperations": 11,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "bigquery",
      "name": "Google BigQuery",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/bigquery/manifest.json",
      "definitionPath": "connectors/bigquery/definition.json",
      "testPath": null,
      "totalOperations": 8,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "google-chat",
      "name": "Google Chat",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/google-chat/manifest.json",
      "definitionPath": "connectors/google-chat/definition.json",
      "testPath": null,
      "totalOperations": 14,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "google-contacts",
      "name": "Google Contacts",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/google-contacts/manifest.json",
      "definitionPath": "connectors/google-contacts/definition.json",
      "testPath": null,
      "totalOperations": 11,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "google-meet",
      "name": "Google Meet",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/google-meet/manifest.json",
      "definitionPath": "connectors/google-meet/definition.json",
      "testPath": null,
      "totalOperations": 13,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "google-slides",
      "name": "Google Slides",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/google-slides/manifest.json",
      "definitionPath": "connectors/google-slides/definition.json",
      "testPath": null,
      "totalOperations": 12,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "grafana",
      "name": "Grafana",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/grafana/manifest.json",
      "definitionPath": "connectors/grafana/definition.json",
      "testPath": null,
      "totalOperations": 7,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "greenhouse",
      "name": "Greenhouse",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/greenhouse/manifest.json",
      "definitionPath": "connectors/greenhouse/definition.json",
      "testPath": null,
      "totalOperations": 15,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "guru",
      "name": "Guru",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/guru/manifest.json",
      "definitionPath": "connectors/guru/definition.json",
      "testPath": null,
      "totalOperations": 15,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "hashicorp-vault",
      "name": "HashiCorp Vault",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/hashicorp-vault/manifest.json",
      "definitionPath": "connectors/hashicorp-vault/definition.json",
      "testPath": null,
      "totalOperations": 7,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "hellosign",
      "name": "HelloSign",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/hellosign/manifest.json",
      "definitionPath": "connectors/hellosign/definition.json",
      "testPath": null,
      "totalOperations": 16,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "helm",
      "name": "Helm",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/helm/manifest.json",
      "definitionPath": "connectors/helm/definition.json",
      "testPath": null,
      "totalOperations": 7,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "hubspot-enhanced",
      "name": "HubSpot Enhanced",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/hubspot-enhanced/manifest.json",
      "definitionPath": "connectors/hubspot-enhanced/definition.json",
      "testPath": null,
      "totalOperations": 16,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "intercom",
      "name": "Intercom",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/intercom/manifest.json",
      "definitionPath": "connectors/intercom/definition.json",
      "testPath": null,
      "totalOperations": 16,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "iterable",
      "name": "Iterable",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/iterable/manifest.json",
      "definitionPath": "connectors/iterable/definition.json",
      "testPath": null,
      "totalOperations": 18,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "jenkins",
      "name": "Jenkins",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/jenkins/manifest.json",
      "definitionPath": "connectors/jenkins/definition.json",
      "testPath": null,
      "totalOperations": 19,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "jira",
      "name": "Jira",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/jira/manifest.json",
      "definitionPath": "connectors/jira/definition.json",
      "testPath": null,
      "totalOperations": 16,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "jira-service-management",
      "name": "Jira Service Management",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/jira-service-management/manifest.json",
      "definitionPath": "connectors/jira-service-management/definition.json",
      "testPath": null,
      "totalOperations": 19,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "jotform",
      "name": "JotForm",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/jotform/manifest.json",
      "definitionPath": "connectors/jotform/definition.json",
      "testPath": null,
      "totalOperations": 18,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "klaviyo",
      "name": "Klaviyo",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/klaviyo/manifest.json",
      "definitionPath": "connectors/klaviyo/definition.json",
      "testPath": null,
      "totalOperations": 15,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "kubernetes",
      "name": "Kubernetes",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/kubernetes/manifest.json",
      "definitionPath": "connectors/kubernetes/definition.json",
      "testPath": null,
      "totalOperations": 7,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "kustomer",
      "name": "Kustomer",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/kustomer/manifest.json",
      "definitionPath": "connectors/kustomer/definition.json",
      "testPath": null,
      "totalOperations": 18,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "lever",
      "name": "Lever",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/lever/manifest.json",
      "definitionPath": "connectors/lever/definition.json",
      "testPath": null,
      "totalOperations": 15,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "linear",
      "name": "Linear",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/linear/manifest.json",
      "definitionPath": "connectors/linear/definition.json",
      "testPath": null,
      "totalOperations": 15,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "llm",
      "name": "LLM (Large Language Model)",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/llm/manifest.json",
      "definitionPath": "connectors/llm/definition.json",
      "testPath": null,
      "totalOperations": 3,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "looker",
      "name": "Looker",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/looker/manifest.json",
      "definitionPath": "connectors/looker/definition.json",
      "testPath": null,
      "totalOperations": 16,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "luma",
      "name": "Luma",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/luma/manifest.json",
      "definitionPath": "connectors/luma/definition.json",
      "testPath": null,
      "totalOperations": 17,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "magento",
      "name": "Magento",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/magento/manifest.json",
      "definitionPath": "connectors/magento/definition.json",
      "testPath": null,
      "totalOperations": 11,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "mailchimp",
      "name": "Mailchimp",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/mailchimp/manifest.json",
      "definitionPath": "connectors/mailchimp/definition.json",
      "testPath": null,
      "totalOperations": 18,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "mailchimp-enhanced",
      "name": "Mailchimp Enhanced",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/mailchimp-enhanced/manifest.json",
      "definitionPath": "connectors/mailchimp-enhanced/definition.json",
      "testPath": null,
      "totalOperations": 14,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "mailgun",
      "name": "Mailgun",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/mailgun/manifest.json",
      "definitionPath": "connectors/mailgun/definition.json",
      "testPath": null,
      "totalOperations": 19,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "marketo",
      "name": "Marketo",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/marketo/manifest.json",
      "definitionPath": "connectors/marketo/definition.json",
      "testPath": null,
      "totalOperations": 21,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "dynamics365",
      "name": "Microsoft Dynamics 365",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/dynamics365/manifest.json",
      "definitionPath": "connectors/dynamics365/definition.json",
      "testPath": null,
      "totalOperations": 11,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "excel-online",
      "name": "Microsoft Excel Online",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/excel-online/manifest.json",
      "definitionPath": "connectors/excel-online/definition.json",
      "testPath": null,
      "totalOperations": 13,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "microsoft-todo",
      "name": "Microsoft To Do",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/microsoft-todo/manifest.json",
      "definitionPath": "connectors/microsoft-todo/definition.json",
      "testPath": null,
      "totalOperations": 10,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "miro",
      "name": "Miro",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/miro/manifest.json",
      "definitionPath": "connectors/miro/definition.json",
      "testPath": null,
      "totalOperations": 19,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "mixpanel",
      "name": "Mixpanel",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/mixpanel/manifest.json",
      "definitionPath": "connectors/mixpanel/definition.json",
      "testPath": null,
      "totalOperations": 20,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "monday",
      "name": "Monday.com",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/monday/manifest.json",
      "definitionPath": "connectors/monday/definition.json",
      "testPath": null,
      "totalOperations": 18,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "monday-enhanced",
      "name": "Monday.com Enhanced",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/monday-enhanced/manifest.json",
      "definitionPath": "connectors/monday-enhanced/definition.json",
      "testPath": null,
      "totalOperations": 14,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "navan",
      "name": "Navan",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/navan/manifest.json",
      "definitionPath": "connectors/navan/definition.json",
      "testPath": null,
      "totalOperations": 7,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "netsuite",
      "name": "NetSuite",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/netsuite/manifest.json",
      "definitionPath": "connectors/netsuite/definition.json",
      "testPath": null,
      "totalOperations": 7,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "newrelic",
      "name": "New Relic",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/newrelic/manifest.json",
      "definitionPath": "connectors/newrelic/definition.json",
      "testPath": null,
      "totalOperations": 8,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "notion-enhanced",
      "name": "Notion Enhanced",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/notion-enhanced/manifest.json",
      "definitionPath": "connectors/notion-enhanced/definition.json",
      "testPath": null,
      "totalOperations": 21,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "okta",
      "name": "Okta",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/okta/manifest.json",
      "definitionPath": "connectors/okta/definition.json",
      "testPath": null,
      "totalOperations": 18,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "opsgenie",
      "name": "Opsgenie",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/opsgenie/manifest.json",
      "definitionPath": "connectors/opsgenie/definition.json",
      "testPath": null,
      "totalOperations": 14,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "pagerduty",
      "name": "PagerDuty",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/pagerduty/manifest.json",
      "definitionPath": "connectors/pagerduty/definition.json",
      "testPath": null,
      "totalOperations": 15,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "pardot",
      "name": "Pardot",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/pardot/manifest.json",
      "definitionPath": "connectors/pardot/definition.json",
      "testPath": null,
      "totalOperations": 8,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "paypal",
      "name": "PayPal",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/paypal/manifest.json",
      "definitionPath": "connectors/paypal/definition.json",
      "testPath": null,
      "totalOperations": 12,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "pipedrive",
      "name": "Pipedrive",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/pipedrive/manifest.json",
      "definitionPath": "connectors/pipedrive/definition.json",
      "testPath": null,
      "totalOperations": 12,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "powerbi",
      "name": "Power BI",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/powerbi/manifest.json",
      "definitionPath": "connectors/powerbi/definition.json",
      "testPath": null,
      "totalOperations": 9,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "powerbi-enhanced",
      "name": "Power BI Enhanced",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/powerbi-enhanced/manifest.json",
      "definitionPath": "connectors/powerbi-enhanced/definition.json",
      "testPath": null,
      "totalOperations": 22,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "prometheus",
      "name": "Prometheus",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/prometheus/manifest.json",
      "definitionPath": "connectors/prometheus/definition.json",
      "testPath": null,
      "totalOperations": 7,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "qualtrics",
      "name": "Qualtrics",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/qualtrics/manifest.json",
      "definitionPath": "connectors/qualtrics/definition.json",
      "testPath": null,
      "totalOperations": 10,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "ramp",
      "name": "Ramp",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/ramp/manifest.json",
      "definitionPath": "connectors/ramp/definition.json",
      "testPath": null,
      "totalOperations": 6,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "razorpay",
      "name": "Razorpay",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/razorpay/manifest.json",
      "definitionPath": "connectors/razorpay/definition.json",
      "testPath": null,
      "totalOperations": 8,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "ringcentral",
      "name": "RingCentral",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/ringcentral/manifest.json",
      "definitionPath": "connectors/ringcentral/definition.json",
      "testPath": null,
      "totalOperations": 10,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "sageintacct",
      "name": "Sage Intacct",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/sageintacct/manifest.json",
      "definitionPath": "connectors/sageintacct/definition.json",
      "testPath": null,
      "totalOperations": 9,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "salesforce",
      "name": "Salesforce",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/salesforce/manifest.json",
      "definitionPath": "connectors/salesforce/definition.json",
      "testPath": null,
      "totalOperations": 6,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "sap-ariba",
      "name": "SAP Ariba",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/sap-ariba/manifest.json",
      "definitionPath": "connectors/sap-ariba/definition.json",
      "testPath": null,
      "totalOperations": 17,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "concur",
      "name": "SAP Concur",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/concur/manifest.json",
      "definitionPath": "connectors/concur/definition.json",
      "testPath": null,
      "totalOperations": 9,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "successfactors",
      "name": "SAP SuccessFactors",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/successfactors/manifest.json",
      "definitionPath": "connectors/successfactors/definition.json",
      "testPath": "server/integrations/__tests__/SuccessfactorsAPIClient.test.ts",
      "totalOperations": 7,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "sendgrid",
      "name": "SendGrid",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/sendgrid/manifest.json",
      "definitionPath": "connectors/sendgrid/definition.json",
      "testPath": null,
      "totalOperations": 10,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "sentry",
      "name": "Sentry",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/sentry/manifest.json",
      "definitionPath": "connectors/sentry/definition.json",
      "testPath": null,
      "totalOperations": 21,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "servicenow",
      "name": "ServiceNow",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/servicenow/manifest.json",
      "definitionPath": "connectors/servicenow/definition.json",
      "testPath": null,
      "totalOperations": 8,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "sharepoint",
      "name": "SharePoint",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/sharepoint/manifest.json",
      "definitionPath": "connectors/sharepoint/definition.json",
      "testPath": null,
      "totalOperations": 18,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "shopify-enhanced",
      "name": "Shopify Enhanced",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/shopify-enhanced/manifest.json",
      "definitionPath": "connectors/shopify-enhanced/definition.json",
      "testPath": null,
      "totalOperations": 14,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "slab",
      "name": "Slab",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/slab/manifest.json",
      "definitionPath": "connectors/slab/definition.json",
      "testPath": null,
      "totalOperations": 10,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "slack-enhanced",
      "name": "Slack Enhanced",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/slack-enhanced/manifest.json",
      "definitionPath": "connectors/slack-enhanced/definition.json",
      "testPath": null,
      "totalOperations": 18,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "smartsheet",
      "name": "Smartsheet",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/smartsheet/manifest.json",
      "definitionPath": "connectors/smartsheet/definition.json",
      "testPath": null,
      "totalOperations": 17,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "snowflake",
      "name": "Snowflake",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/snowflake/manifest.json",
      "definitionPath": "connectors/snowflake/definition.json",
      "testPath": "server/integrations/__tests__/SnowflakeAPIClient.test.ts",
      "totalOperations": 16,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "sonarqube",
      "name": "SonarQube",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/sonarqube/manifest.json",
      "definitionPath": "connectors/sonarqube/definition.json",
      "testPath": null,
      "totalOperations": 7,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "nexus",
      "name": "Sonatype Nexus",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/nexus/manifest.json",
      "definitionPath": "connectors/nexus/definition.json",
      "testPath": null,
      "totalOperations": 7,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "square",
      "name": "Square",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/square/manifest.json",
      "definitionPath": "connectors/square/definition.json",
      "testPath": null,
      "totalOperations": 10,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "surveymonkey",
      "name": "SurveyMonkey",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/surveymonkey/manifest.json",
      "definitionPath": "connectors/surveymonkey/definition.json",
      "testPath": null,
      "totalOperations": 17,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "tableau",
      "name": "Tableau",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/tableau/manifest.json",
      "definitionPath": "connectors/tableau/definition.json",
      "testPath": null,
      "totalOperations": 18,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "talkdesk",
      "name": "Talkdesk",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/talkdesk/manifest.json",
      "definitionPath": "connectors/talkdesk/definition.json",
      "testPath": null,
      "totalOperations": 17,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "teamwork",
      "name": "Teamwork",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/teamwork/manifest.json",
      "definitionPath": "connectors/teamwork/definition.json",
      "testPath": null,
      "totalOperations": 18,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "terraform-cloud",
      "name": "Terraform Cloud",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/terraform-cloud/manifest.json",
      "definitionPath": "connectors/terraform-cloud/definition.json",
      "testPath": null,
      "totalOperations": 7,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "toggl",
      "name": "Toggl Track",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/toggl/manifest.json",
      "definitionPath": "connectors/toggl/definition.json",
      "testPath": null,
      "totalOperations": 21,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "trello-enhanced",
      "name": "Trello Enhanced",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/trello-enhanced/manifest.json",
      "definitionPath": "connectors/trello-enhanced/definition.json",
      "testPath": null,
      "totalOperations": 12,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "twilio",
      "name": "Twilio",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/twilio/manifest.json",
      "definitionPath": "connectors/twilio/definition.json",
      "testPath": null,
      "totalOperations": 15,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "typeform",
      "name": "Typeform",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/typeform/manifest.json",
      "definitionPath": "connectors/typeform/definition.json",
      "testPath": null,
      "totalOperations": 2,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "victorops",
      "name": "VictorOps",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/victorops/manifest.json",
      "definitionPath": "connectors/victorops/definition.json",
      "testPath": null,
      "totalOperations": 15,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "webflow",
      "name": "Webflow",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/webflow/manifest.json",
      "definitionPath": "connectors/webflow/definition.json",
      "testPath": null,
      "totalOperations": 18,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "woocommerce",
      "name": "WooCommerce",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/woocommerce/manifest.json",
      "definitionPath": "connectors/woocommerce/definition.json",
      "testPath": null,
      "totalOperations": 10,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "workday",
      "name": "Workday",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/workday/manifest.json",
      "definitionPath": "connectors/workday/definition.json",
      "testPath": null,
      "totalOperations": 17,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "xero",
      "name": "Xero",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/xero/manifest.json",
      "definitionPath": "connectors/xero/definition.json",
      "testPath": null,
      "totalOperations": 16,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "zoho-books",
      "name": "Zoho Books",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/zoho-books/manifest.json",
      "definitionPath": "connectors/zoho-books/definition.json",
      "testPath": null,
      "totalOperations": 16,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "zoho-crm",
      "name": "Zoho CRM",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/zoho-crm/manifest.json",
      "definitionPath": "connectors/zoho-crm/definition.json",
      "testPath": null,
      "totalOperations": 13,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    },
    {
      "id": "zoom-enhanced",
      "name": "Zoom Enhanced",
      "tier": 2,
      "plannedSquadOwner": "Apps Script Enablement",
      "targetSprint": "Backlog",
      "manifestPath": "connectors/zoom-enhanced/manifest.json",
      "definitionPath": "connectors/zoom-enhanced/definition.json",
      "testPath": null,
      "totalOperations": 12,
      "appsScriptOperations": 0,
      "appsScriptStatus": "Not declared"
    }
  ]
}
```
<!-- END BACKLOG:JSON -->

## Tier 0 — launch blockers that must stay Apps Script-ready as the platform evolves.

| Connector | Total Ops | Apps Script status | Squad | Target Sprint | Manifest | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| Gmail (gmail) | 10 | Not declared | Workspace Platform | 2025.05 | [manifest](../../connectors/gmail/manifest.json) | [tests](../../server/workflow/__tests__/WorkflowRuntime.gmail.integration.test.ts) |
| Google Calendar (google-calendar) | 16 | Not declared | Workspace Platform | 2025.06 | [manifest](../../connectors/google-calendar/manifest.json) | — |
| Google Docs (google-docs) | 12 | Not declared | Workspace Platform | 2025.06 | [manifest](../../connectors/google-docs/manifest.json) | — |
| Google Drive (google-drive) | 18 | Not declared | Workspace Platform | 2025.06 | [manifest](../../connectors/google-drive/manifest.json) | — |
| Google Forms (google-forms) | 12 | Not declared | Workspace Platform | 2025.07 | [manifest](../../connectors/google-forms/manifest.json) | — |
| Google Sheets Enhanced (google-sheets-enhanced) | 14 | Not declared | Workspace Platform | 2025.05 | [manifest](../../connectors/google-sheets-enhanced/manifest.json) | — |
| Salesforce Enhanced (salesforce-enhanced) | 10 | Not declared | Revenue Automation | 2025.07 | [manifest](../../connectors/salesforce-enhanced/manifest.json) | — |
| Slack (slack) | 16 | Not declared | Collaboration Core | 2025.05 | [manifest](../../connectors/slack/manifest.json) | — |

## Tier 1 — high-usage connectors scheduled in the near-term enablement waves.

| Connector | Total Ops | Apps Script status | Squad | Target Sprint | Manifest | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| HubSpot (hubspot) | 19 | Not declared | Revenue Automation | 2025.08 | [manifest](../../connectors/hubspot/manifest.json) | — |
| Microsoft Outlook (outlook) | 11 | Not declared | Collaboration Core | 2025.08 | [manifest](../../connectors/outlook/manifest.json) | — |
| Microsoft Teams (microsoft-teams) | 12 | Not declared | Collaboration Core | 2025.08 | [manifest](../../connectors/microsoft-teams/manifest.json) | — |
| Notion (notion) | 13 | Not declared | Knowledge Workflows | 2025.10 | [manifest](../../connectors/notion/manifest.json) | — |
| OneDrive (onedrive) | 8 | Not declared | Collaboration Core | 2025.09 | [manifest](../../connectors/onedrive/manifest.json) | — |
| QuickBooks (quickbooks) | 17 | Not declared | Finance Automations | 2025.09 | [manifest](../../connectors/quickbooks/manifest.json) | — |
| Shopify (shopify) | 18 | Not declared | Commerce Integrations | 2025.10 | [manifest](../../connectors/shopify/manifest.json) | — |
| Stripe (stripe) | 14 | Not declared | Finance Automations | 2025.10 | [manifest](../../connectors/stripe/manifest.json) | — |
| Stripe Enhanced (stripe-enhanced) | 7 | Not declared | Finance Automations | 2025.10 | [manifest](../../connectors/stripe-enhanced/manifest.json) | — |
| Trello (trello) | 24 | Not declared | Productivity Enablement | 2025.09 | [manifest](../../connectors/trello/manifest.json) | — |
| Zendesk (zendesk) | 21 | Not declared | Support Ops | 2025.09 | [manifest](../../connectors/zendesk/manifest.json) | — |

## Tier 2 — remaining catalog connectors tracked for long-tail enablement.

| Connector | Total Ops | Apps Script status | Squad | Target Sprint | Manifest | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| Adobe Acrobat Sign (adobesign) | 7 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/adobesign/manifest.json) | — |
| Adobe Workfront (workfront) | 16 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/workfront/manifest.json) | — |
| ADP Workforce Now (adp) | 5 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/adp/manifest.json) | — |
| Adyen (adyen) | 5 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/adyen/manifest.json) | — |
| Airtable (airtable) | 8 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/airtable/manifest.json) | — |
| Airtable Enhanced (airtable-enhanced) | 10 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/airtable-enhanced/manifest.json) | — |
| Ansible (ansible) | 9 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/ansible/manifest.json) | — |
| Argo CD (argocd) | 7 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/argocd/manifest.json) | — |
| Asana Enhanced (asana-enhanced) | 15 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/asana-enhanced/manifest.json) | — |
| Atlassian Confluence (confluence) | 10 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/confluence/manifest.json) | — |
| AWS CloudFormation (aws-cloudformation) | 7 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/aws-cloudformation/manifest.json) | — |
| AWS CodePipeline (aws-codepipeline) | 8 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/aws-codepipeline/manifest.json) | — |
| Azure DevOps (azure-devops) | 7 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/azure-devops/manifest.json) | — |
| BambooHR (bamboohr) | 7 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/bamboohr/manifest.json) | — |
| Basecamp (basecamp) | 8 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/basecamp/manifest.json) | — |
| BigCommerce (bigcommerce) | 8 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/bigcommerce/manifest.json) | — |
| Bitbucket (bitbucket) | 8 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/bitbucket/manifest.json) | — |
| Box (box) | 10 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/box/manifest.json) | [tests](../../server/runtime/__tests__/ProcessSandboxExecutor.resourceLimits.test.ts) |
| Braze (braze) | 8 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/braze/manifest.json) | — |
| Brex (brex) | 10 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/brex/manifest.json) | — |
| Cal.com (caldotcom) | 10 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/caldotcom/manifest.json) | — |
| Calendly (calendly) | 8 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/calendly/manifest.json) | — |
| CircleCI (circleci) | 10 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/circleci/manifest.json) | — |
| Cisco Webex (webex) | 13 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/webex/manifest.json) | — |
| ClickUp (clickup) | 11 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/clickup/manifest.json) | — |
| Coda (coda) | 11 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/coda/manifest.json) | — |
| Coupa (coupa) | 10 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/coupa/manifest.json) | — |
| Databricks (databricks) | 12 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/databricks/manifest.json) | — |
| Datadog (datadog) | 9 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/datadog/manifest.json) | — |
| Docker Hub (docker-hub) | 7 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/docker-hub/manifest.json) | — |
| DocuSign (docusign) | 11 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/docusign/manifest.json) | — |
| Dropbox (dropbox) | 13 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/dropbox/manifest.json) | — |
| Dropbox Enhanced (dropbox-enhanced) | 14 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/dropbox-enhanced/manifest.json) | — |
| Egnyte (egnyte) | 12 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/egnyte/manifest.json) | — |
| Expensify (expensify) | 11 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/expensify/manifest.json) | — |
| Freshdesk (freshdesk) | 10 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/freshdesk/manifest.json) | — |
| GitHub (github) | 20 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/github/manifest.json) | — |
| GitHub Enhanced (github-enhanced) | 11 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/github-enhanced/manifest.json) | — |
| GitLab (gitlab) | 7 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/gitlab/manifest.json) | — |
| Gmail Enhanced (gmail-enhanced) | 12 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/gmail-enhanced/manifest.json) | — |
| Google Admin (google-admin) | 11 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/google-admin/manifest.json) | — |
| Google BigQuery (bigquery) | 8 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/bigquery/manifest.json) | — |
| Google Chat (google-chat) | 14 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/google-chat/manifest.json) | — |
| Google Contacts (google-contacts) | 11 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/google-contacts/manifest.json) | — |
| Google Meet (google-meet) | 13 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/google-meet/manifest.json) | — |
| Google Slides (google-slides) | 12 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/google-slides/manifest.json) | — |
| Grafana (grafana) | 7 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/grafana/manifest.json) | — |
| Greenhouse (greenhouse) | 15 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/greenhouse/manifest.json) | — |
| Guru (guru) | 15 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/guru/manifest.json) | — |
| HashiCorp Vault (hashicorp-vault) | 7 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/hashicorp-vault/manifest.json) | — |
| HelloSign (hellosign) | 16 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/hellosign/manifest.json) | — |
| Helm (helm) | 7 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/helm/manifest.json) | — |
| HubSpot Enhanced (hubspot-enhanced) | 16 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/hubspot-enhanced/manifest.json) | — |
| Intercom (intercom) | 16 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/intercom/manifest.json) | — |
| Iterable (iterable) | 18 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/iterable/manifest.json) | — |
| Jenkins (jenkins) | 19 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/jenkins/manifest.json) | — |
| Jira (jira) | 16 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/jira/manifest.json) | — |
| Jira Service Management (jira-service-management) | 19 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/jira-service-management/manifest.json) | — |
| JotForm (jotform) | 18 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/jotform/manifest.json) | — |
| Klaviyo (klaviyo) | 15 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/klaviyo/manifest.json) | — |
| Kubernetes (kubernetes) | 7 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/kubernetes/manifest.json) | — |
| Kustomer (kustomer) | 18 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/kustomer/manifest.json) | — |
| Lever (lever) | 15 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/lever/manifest.json) | — |
| Linear (linear) | 15 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/linear/manifest.json) | — |
| LLM (Large Language Model) (llm) | 3 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/llm/manifest.json) | — |
| Looker (looker) | 16 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/looker/manifest.json) | — |
| Luma (luma) | 17 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/luma/manifest.json) | — |
| Magento (magento) | 11 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/magento/manifest.json) | — |
| Mailchimp (mailchimp) | 18 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/mailchimp/manifest.json) | — |
| Mailchimp Enhanced (mailchimp-enhanced) | 14 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/mailchimp-enhanced/manifest.json) | — |
| Mailgun (mailgun) | 19 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/mailgun/manifest.json) | — |
| Marketo (marketo) | 21 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/marketo/manifest.json) | — |
| Microsoft Dynamics 365 (dynamics365) | 11 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/dynamics365/manifest.json) | — |
| Microsoft Excel Online (excel-online) | 13 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/excel-online/manifest.json) | — |
| Microsoft To Do (microsoft-todo) | 10 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/microsoft-todo/manifest.json) | — |
| Miro (miro) | 19 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/miro/manifest.json) | — |
| Mixpanel (mixpanel) | 20 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/mixpanel/manifest.json) | — |
| Monday.com (monday) | 18 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/monday/manifest.json) | — |
| Monday.com Enhanced (monday-enhanced) | 14 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/monday-enhanced/manifest.json) | — |
| Navan (navan) | 7 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/navan/manifest.json) | — |
| NetSuite (netsuite) | 7 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/netsuite/manifest.json) | — |
| New Relic (newrelic) | 8 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/newrelic/manifest.json) | — |
| Notion Enhanced (notion-enhanced) | 21 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/notion-enhanced/manifest.json) | — |
| Okta (okta) | 18 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/okta/manifest.json) | — |
| Opsgenie (opsgenie) | 14 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/opsgenie/manifest.json) | — |
| PagerDuty (pagerduty) | 15 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/pagerduty/manifest.json) | — |
| Pardot (pardot) | 8 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/pardot/manifest.json) | — |
| PayPal (paypal) | 12 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/paypal/manifest.json) | — |
| Pipedrive (pipedrive) | 12 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/pipedrive/manifest.json) | — |
| Power BI (powerbi) | 9 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/powerbi/manifest.json) | — |
| Power BI Enhanced (powerbi-enhanced) | 22 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/powerbi-enhanced/manifest.json) | — |
| Prometheus (prometheus) | 7 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/prometheus/manifest.json) | — |
| Qualtrics (qualtrics) | 10 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/qualtrics/manifest.json) | — |
| Ramp (ramp) | 6 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/ramp/manifest.json) | — |
| Razorpay (razorpay) | 8 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/razorpay/manifest.json) | — |
| RingCentral (ringcentral) | 10 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/ringcentral/manifest.json) | — |
| Sage Intacct (sageintacct) | 9 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/sageintacct/manifest.json) | — |
| Salesforce (salesforce) | 6 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/salesforce/manifest.json) | — |
| SAP Ariba (sap-ariba) | 17 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/sap-ariba/manifest.json) | — |
| SAP Concur (concur) | 9 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/concur/manifest.json) | — |
| SAP SuccessFactors (successfactors) | 7 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/successfactors/manifest.json) | [tests](../../server/integrations/__tests__/SuccessfactorsAPIClient.test.ts) |
| SendGrid (sendgrid) | 10 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/sendgrid/manifest.json) | — |
| Sentry (sentry) | 21 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/sentry/manifest.json) | — |
| ServiceNow (servicenow) | 8 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/servicenow/manifest.json) | — |
| SharePoint (sharepoint) | 18 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/sharepoint/manifest.json) | — |
| Shopify Enhanced (shopify-enhanced) | 14 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/shopify-enhanced/manifest.json) | — |
| Slab (slab) | 10 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/slab/manifest.json) | — |
| Slack Enhanced (slack-enhanced) | 18 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/slack-enhanced/manifest.json) | — |
| Smartsheet (smartsheet) | 17 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/smartsheet/manifest.json) | — |
| Snowflake (snowflake) | 16 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/snowflake/manifest.json) | [tests](../../server/integrations/__tests__/SnowflakeAPIClient.test.ts) |
| SonarQube (sonarqube) | 7 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/sonarqube/manifest.json) | — |
| Sonatype Nexus (nexus) | 7 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/nexus/manifest.json) | — |
| Square (square) | 10 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/square/manifest.json) | — |
| SurveyMonkey (surveymonkey) | 17 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/surveymonkey/manifest.json) | — |
| Tableau (tableau) | 18 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/tableau/manifest.json) | — |
| Talkdesk (talkdesk) | 17 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/talkdesk/manifest.json) | — |
| Teamwork (teamwork) | 18 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/teamwork/manifest.json) | — |
| Terraform Cloud (terraform-cloud) | 7 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/terraform-cloud/manifest.json) | — |
| Toggl Track (toggl) | 21 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/toggl/manifest.json) | — |
| Trello Enhanced (trello-enhanced) | 12 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/trello-enhanced/manifest.json) | — |
| Twilio (twilio) | 15 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/twilio/manifest.json) | — |
| Typeform (typeform) | 2 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/typeform/manifest.json) | — |
| VictorOps (victorops) | 15 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/victorops/manifest.json) | — |
| Webflow (webflow) | 18 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/webflow/manifest.json) | — |
| WooCommerce (woocommerce) | 10 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/woocommerce/manifest.json) | — |
| Workday (workday) | 17 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/workday/manifest.json) | — |
| Xero (xero) | 16 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/xero/manifest.json) | — |
| Zoho Books (zoho-books) | 16 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/zoho-books/manifest.json) | — |
| Zoho CRM (zoho-crm) | 13 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/zoho-crm/manifest.json) | — |
| Zoom Enhanced (zoom-enhanced) | 12 | Not declared | Apps Script Enablement | Backlog | [manifest](../../connectors/zoom-enhanced/manifest.json) | — |

