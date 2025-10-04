import type { WebhookTrigger } from './types';

export interface WebhookSignatureTemplate {
  id: string;
  providerId: string;
  signatureHeader?: string;
  timestampHeader?: string;
  timestampToleranceSeconds?: number;
  replayWindowSeconds?: number;
}

interface TemplateRegistration {
  template: WebhookSignatureTemplate;
  connectors?: string[];
}

class WebhookSignatureRegistry {
  private readonly templates = new Map<string, WebhookSignatureTemplate>();
  private readonly connectorTemplates = new Map<string, string>();

  constructor(registrations: TemplateRegistration[] = []) {
    for (const registration of registrations) {
      this.registerTemplate(registration.template, registration.connectors ?? []);
    }
  }

  registerTemplate(template: WebhookSignatureTemplate, connectors: string[] = []): void {
    this.templates.set(template.id, { ...template });
    for (const connectorId of connectors) {
      if (typeof connectorId === 'string' && connectorId.trim().length > 0) {
        this.connectorTemplates.set(connectorId, template.id);
      }
    }
  }

  getTemplateById(id: string | undefined | null): WebhookSignatureTemplate | undefined {
    if (!id) {
      return undefined;
    }
    return this.templates.get(id) ?? undefined;
  }

  getTemplateForConnector(connectorId: string | undefined | null): WebhookSignatureTemplate | undefined {
    if (!connectorId) {
      return undefined;
    }
    const templateId = this.connectorTemplates.get(connectorId);
    return templateId ? this.templates.get(templateId) ?? undefined : undefined;
  }

  getTemplateForTrigger(trigger: Pick<WebhookTrigger, 'appId'>, preferredTemplateId?: string):
    | WebhookSignatureTemplate
    | undefined {
    return (
      this.getTemplateById(preferredTemplateId) ??
      this.getTemplateForConnector(trigger.appId)
    );
  }

  hasTemplateForConnector(connectorId: string | undefined | null): boolean {
    if (!connectorId) {
      return false;
    }
    if (this.connectorTemplates.has(connectorId)) {
      return true;
    }
    return Array.from(this.templates.values()).some((template) => template.id === connectorId);
  }
}

const defaultRegistry = new WebhookSignatureRegistry([
  {
    template: {
      id: 'slack.default',
      providerId: 'slack',
      signatureHeader: 'x-slack-signature',
      timestampHeader: 'x-slack-request-timestamp',
      timestampToleranceSeconds: 300,
      replayWindowSeconds: 300,
    },
    connectors: ['slack', 'slack-enhanced'],
  },
  {
    template: {
      id: 'stripe.default',
      providerId: 'stripe',
      signatureHeader: 'stripe-signature',
      timestampToleranceSeconds: 300,
      replayWindowSeconds: 300,
    },
    connectors: ['stripe', 'stripe-enhanced'],
  },
  {
    template: {
      id: 'github.sha256',
      providerId: 'github',
      signatureHeader: 'x-hub-signature-256',
      replayWindowSeconds: 600,
    },
    connectors: ['github', 'github-enhanced'],
  },
  {
    template: {
      id: 'shopify.hmac',
      providerId: 'shopify',
      signatureHeader: 'x-shopify-hmac-sha256',
      replayWindowSeconds: 300,
    },
    connectors: ['shopify', 'shopify-enhanced'],
  },
]);

export const webhookSignatureRegistry = defaultRegistry;
