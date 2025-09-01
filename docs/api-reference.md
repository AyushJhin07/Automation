# 📚 **API REFERENCE**

## **Enterprise Automation Platform REST API**

Complete API documentation for developers and technical integrators.

**Base URL:** `https://api.automationplatform.com/v1`
**Authentication:** Bearer Token (JWT)

---

## **🔐 AUTHENTICATION**

### **Get API Token**

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@company.com",
  "password": "your-password"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-123",
    "email": "user@company.com",
    "plan": "enterprise"
  },
  "expiresIn": "7d"
}
```

### **API Authentication**

Include the JWT token in all API requests:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## **🤖 AI WORKFLOW BUILDER**

### **Generate Workflow Plan**

Generate an intelligent automation plan from natural language description.

```http
POST /api/ai-planner/plan-workflow
Authorization: Bearer <token>
Content-Type: application/json

{
  "prompt": "Monitor Gmail for invoices and log them to Google Sheets",
  "userId": "user-123",
  "context": {
    "industry": "manufacturing",
    "companySize": "mid-market"
  }
}
```

**Response:**
```json
{
  "success": true,
  "plan": {
    "id": "plan-456",
    "title": "Gmail Invoice Monitoring Automation",
    "description": "Automatically detect invoices in Gmail and log details to Google Sheets",
    "apps": ["gmail", "sheets"],
    "complexity": "medium",
    "estimatedROI": 75000,
    "questions": [
      {
        "id": "gmail_query",
        "text": "What search criteria should we use to find invoices in your Gmail?",
        "type": "text",
        "required": true,
        "placeholder": "e.g., subject:invoice OR subject:bill"
      },
      {
        "id": "sheet_destination",
        "text": "Which Google Sheet should we log the invoice data to?",
        "type": "text", 
        "required": true,
        "placeholder": "Google Sheets URL"
      },
      {
        "id": "data_fields",
        "text": "What invoice details should we extract and log?",
        "type": "checkbox",
        "required": true,
        "options": ["Sender", "Date", "Amount", "Invoice Number", "Due Date"]
      }
    ]
  }
}
```

### **Refine Plan with Answers**

Process user answers to refine the automation plan.

```http
POST /api/ai-planner/refine-plan
Authorization: Bearer <token>
Content-Type: application/json

{
  "planId": "plan-456",
  "answers": {
    "gmail_query": "subject:invoice OR subject:bill",
    "sheet_destination": "https://docs.google.com/spreadsheets/d/1ABC.../edit",
    "data_fields": ["Sender", "Date", "Amount", "Invoice Number"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "refinedPlan": {
    "id": "plan-456",
    "complete": true,
    "workflow": {
      "trigger": {
        "type": "time.schedule",
        "frequency": "every_15_minutes"
      },
      "actions": [
        {
          "type": "gmail.search",
          "query": "subject:invoice OR subject:bill",
          "maxResults": 50
        },
        {
          "type": "sheets.append_row",
          "spreadsheetId": "1ABC...",
          "values": ["{{sender}}", "{{date}}", "{{amount}}", "{{invoiceNumber}}"]
        }
      ]
    }
  }
}
```

---

## **🏗️ WORKFLOW MANAGEMENT**

### **Build Workflow**

Convert a plan or manual specification into executable automation.

```http
POST /api/workflow/build
Authorization: Bearer <token>
Content-Type: application/json

{
  "prompt": "Monitor Gmail for invoices and log to Sheets",
  "answers": {
    "trigger": "time.every_15_minutes",
    "gmail": {
      "query": "subject:invoice",
      "maxResults": 50
    },
    "sheets": {
      "spreadsheetId": "1ABC123...",
      "sheetName": "Invoices",
      "columns": ["Sender", "Date", "Amount"]
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "workflowId": "wf-789",
  "graph": {
    "id": "wf-789",
    "name": "Gmail Invoice Monitor",
    "nodes": [
      {
        "id": "trigger-1",
        "type": "trigger.time",
        "app": "time",
        "operation": "schedule",
        "params": {
          "frequency": "every_15_minutes"
        }
      },
      {
        "id": "gmail-1", 
        "type": "action.gmail",
        "app": "gmail",
        "operation": "search_emails",
        "params": {
          "query": "subject:invoice",
          "maxResults": 50
        }
      },
      {
        "id": "sheets-1",
        "type": "action.sheets",
        "app": "sheets", 
        "operation": "append_row",
        "params": {
          "spreadsheetId": "1ABC123...",
          "sheetName": "Invoices",
          "columns": ["Sender", "Date", "Amount"]
        }
      }
    ],
    "edges": [
      {"from": "trigger-1", "to": "gmail-1"},
      {"from": "gmail-1", "to": "sheets-1"}
    ]
  },
  "code": {
    "language": "javascript",
    "content": "function main() { ... }"
  }
}
```

### **Get Workflow**

Retrieve a built workflow by ID.

```http
GET /api/workflows/wf-789
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "workflow": {
    "id": "wf-789",
    "name": "Gmail Invoice Monitor",
    "status": "active",
    "createdAt": "2024-01-15T10:30:00Z",
    "graph": { /* workflow graph */ },
    "code": { /* generated code */ },
    "metrics": {
      "totalExecutions": 1250,
      "successRate": 96.8,
      "avgResponseTime": 1.2
    }
  }
}
```

### **List User Workflows**

Get all workflows for the authenticated user.

```http
GET /api/workflows?limit=20&offset=0
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "workflows": [
    {
      "id": "wf-789",
      "name": "Gmail Invoice Monitor", 
      "status": "active",
      "createdAt": "2024-01-15T10:30:00Z",
      "lastExecution": "2024-01-20T14:45:00Z",
      "successRate": 96.8
    }
  ],
  "total": 45,
  "limit": 20,
  "offset": 0
}
```

---

## **📱 APP CATALOG**

### **List Available Apps**

Get all 149 available app integrations.

```http
GET /api/apps
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "apps": [
    {
      "id": "gmail",
      "name": "Gmail",
      "category": "Email",
      "description": "Google Gmail email automation",
      "hasImplementation": true,
      "operations": [
        {
          "id": "send_email",
          "name": "Send Email",
          "description": "Send an email message",
          "parameters": [
            {"name": "to", "type": "string", "required": true},
            {"name": "subject", "type": "string", "required": true},
            {"name": "body", "type": "string", "required": true}
          ]
        },
        {
          "id": "search_emails",
          "name": "Search Emails", 
          "description": "Search for emails matching criteria",
          "parameters": [
            {"name": "query", "type": "string", "required": true},
            {"name": "maxResults", "type": "number", "required": false}
          ]
        }
      ],
      "authType": "oauth2",
      "documentation": "https://docs.automationplatform.com/apps/gmail"
    }
  ],
  "total": 149,
  "categories": [
    "Email", "Spreadsheets", "CRM", "Communication", 
    "Storage", "Project Management", "Marketing"
  ]
}
```

### **Get App Details**

Get detailed information about a specific app.

```http
GET /api/apps/gmail
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "app": {
    "id": "gmail",
    "name": "Gmail",
    "category": "Email",
    "description": "Google Gmail email automation and monitoring",
    "hasImplementation": true,
    "version": "2.1.0",
    "operations": [
      {
        "id": "send_email",
        "name": "Send Email",
        "description": "Send an email message",
        "parameters": [
          {
            "name": "to",
            "type": "string",
            "required": true,
            "description": "Recipient email address",
            "example": "user@company.com"
          },
          {
            "name": "subject", 
            "type": "string",
            "required": true,
            "description": "Email subject line",
            "example": "Invoice Notification"
          },
          {
            "name": "body",
            "type": "string", 
            "required": true,
            "description": "Email message body",
            "example": "New invoice received..."
          }
        ],
        "example": {
          "to": "finance@company.com",
          "subject": "New Invoice: INV-001",
          "body": "A new invoice has been received and logged to your tracking sheet."
        }
      }
    ],
    "authType": "oauth2",
    "scopes": ["https://www.googleapis.com/auth/gmail.send"],
    "documentation": "https://docs.automationplatform.com/apps/gmail",
    "examples": [
      "Send notification emails",
      "Monitor inbox for specific emails", 
      "Auto-respond to customer inquiries"
    ]
  }
}
```

---

## **🔧 EXECUTION & MONITORING**

### **Execute Workflow**

Manually trigger a workflow execution.

```http
POST /api/workflows/wf-789/execute
Authorization: Bearer <token>
Content-Type: application/json

{
  "context": {
    "testMode": false,
    "parameters": {
      "customQuery": "subject:urgent invoice"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "executionId": "exec-456",
  "status": "running",
  "startedAt": "2024-01-20T15:30:00Z",
  "estimatedDuration": 30
}
```

### **Get Execution Status**

Check the status of a workflow execution.

```http
GET /api/executions/exec-456
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "execution": {
    "id": "exec-456",
    "workflowId": "wf-789", 
    "status": "completed",
    "startedAt": "2024-01-20T15:30:00Z",
    "completedAt": "2024-01-20T15:30:28Z",
    "duration": 28,
    "steps": [
      {
        "id": "trigger-1",
        "status": "completed",
        "duration": 1,
        "output": {"triggered": true}
      },
      {
        "id": "gmail-1",
        "status": "completed", 
        "duration": 15,
        "output": {"emailsFound": 3}
      },
      {
        "id": "sheets-1",
        "status": "completed",
        "duration": 12,
        "output": {"rowsAdded": 3}
      }
    ],
    "result": {
      "success": true,
      "message": "Processed 3 new invoices successfully"
    }
  }
}
```

### **Get Workflow Metrics**

Get performance and usage metrics for a workflow.

```http
GET /api/workflows/wf-789/metrics?period=30d
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "metrics": {
    "period": "30d",
    "totalExecutions": 1250,
    "successfulExecutions": 1210,
    "failedExecutions": 40,
    "successRate": 96.8,
    "avgResponseTime": 1.2,
    "avgExecutionTime": 28.5,
    "dataProcessed": {
      "emailsProcessed": 3750,
      "rowsCreated": 3750
    },
    "executionHistory": [
      {
        "date": "2024-01-20",
        "executions": 48,
        "successRate": 97.9,
        "avgDuration": 26.3
      }
    ],
    "errorBreakdown": [
      {
        "type": "gmail_quota_exceeded",
        "count": 25,
        "percentage": 62.5
      },
      {
        "type": "sheets_permission_denied", 
        "count": 15,
        "percentage": 37.5
      }
    ]
  }
}
```

---

## **🏢 ENTERPRISE FEATURES**

### **Organization Management**

#### **Create Organization**

```http
POST /api/organizations
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Acme Corporation",
  "domain": "acme.com",
  "plan": "enterprise",
  "settings": {
    "ssoEnabled": true,
    "auditLogging": true,
    "customBranding": true
  }
}
```

#### **List Organization Users**

```http
GET /api/organizations/org-123/users
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "users": [
    {
      "id": "user-456",
      "email": "john@acme.com",
      "role": "admin",
      "status": "active",
      "lastLogin": "2024-01-20T14:30:00Z"
    }
  ]
}
```

### **Collaboration Features**

#### **Share Workflow**

```http
POST /api/workflows/wf-789/share
Authorization: Bearer <token>
Content-Type: application/json

{
  "emails": ["colleague@company.com"],
  "permission": "edit",
  "message": "Please review this automation workflow"
}
```

#### **Get Shared Workflows**

```http
GET /api/workflows/shared
Authorization: Bearer <token>
```

### **Analytics & Reporting**

#### **Get Organization Analytics**

```http
GET /api/organizations/org-123/analytics?period=30d
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "analytics": {
    "period": "30d",
    "overview": {
      "totalWorkflows": 245,
      "activeWorkflows": 198,
      "totalExecutions": 45000,
      "successRate": 97.2,
      "costSavings": 125000
    },
    "userEngagement": {
      "activeUsers": 45,
      "workflowsPerUser": 5.4,
      "avgSessionDuration": 18.5
    },
    "appUsage": [
      {"app": "gmail", "usage": 35.2},
      {"app": "sheets", "usage": 28.7},
      {"app": "slack", "usage": 15.3}
    ]
  }
}
```

---

## **🔒 SECURITY & COMPLIANCE**

### **API Rate Limits**

- **Free Plan:** 100 requests/hour
- **Professional:** 1,000 requests/hour  
- **Enterprise:** 10,000 requests/hour
- **Enterprise Plus:** Unlimited

### **Error Handling**

All API endpoints return consistent error responses:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": [
      {
        "field": "email",
        "message": "Valid email address required"
      }
    ]
  },
  "requestId": "req-789"
}
```

### **Common Error Codes**

- `400` - Bad Request (validation errors)
- `401` - Unauthorized (invalid/missing token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error (system error)

---

## **📊 WEBHOOKS**

### **Configure Webhook**

Receive real-time notifications for workflow events.

```http
POST /api/webhooks
Authorization: Bearer <token>
Content-Type: application/json

{
  "url": "https://your-app.com/webhook",
  "events": ["workflow.completed", "workflow.failed"],
  "secret": "your-webhook-secret"
}
```

### **Webhook Payload Example**

```json
{
  "event": "workflow.completed",
  "timestamp": "2024-01-20T15:30:28Z",
  "data": {
    "workflowId": "wf-789",
    "executionId": "exec-456",
    "status": "completed",
    "duration": 28,
    "result": {
      "success": true,
      "message": "Processed 3 new invoices"
    }
  },
  "signature": "sha256=..."
}
```

---

## **🛠️ SDK & LIBRARIES**

### **JavaScript/Node.js**

```bash
npm install @automation-platform/sdk
```

```javascript
import { AutomationClient } from '@automation-platform/sdk';

const client = new AutomationClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.automationplatform.com/v1'
});

// Build workflow with AI
const workflow = await client.ai.planWorkflow({
  prompt: 'Monitor Gmail for invoices and log to Sheets',
  userId: 'user-123'
});

// Execute workflow
const execution = await client.workflows.execute(workflow.id);
```

### **Python**

```bash
pip install automation-platform-sdk
```

```python
from automation_platform import AutomationClient

client = AutomationClient(api_key='your-api-key')

# Build workflow
workflow = client.ai.plan_workflow(
    prompt='Monitor Gmail for invoices',
    user_id='user-123'
)

# Get metrics
metrics = client.workflows.get_metrics(workflow.id)
```

---

## **📞 SUPPORT**

### **API Support**

- **Documentation:** [docs.automationplatform.com/api](https://docs.automationplatform.com/api)
- **Status Page:** [status.automationplatform.com](https://status.automationplatform.com)
- **Developer Discord:** [discord.gg/automation-platform](https://discord.gg/automation-platform)
- **Email Support:** [api-support@automationplatform.com](mailto:api-support@automationplatform.com)

### **Enterprise Support**

- **Dedicated Support:** 24/7 enterprise hotline
- **Technical Account Manager:** Assigned success manager
- **Custom Integration:** Professional services available
- **SLA Guarantees:** 99.9% uptime, <2s response time

---

**🚀 Ready to build amazing automations? [Get your API key](https://automationplatform.com/api-keys) and start coding!**