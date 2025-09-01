/**
 * CUSTOMER SUCCESS: Enterprise Support Infrastructure
 * 
 * Comprehensive customer success and support system for enterprise clients
 * with automated ticket routing, knowledge base, and success tracking.
 */

export interface SupportTicket {
  id: string;
  customerId: string;
  organizationId: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
  category: 'technical' | 'billing' | 'feature_request' | 'bug_report' | 'onboarding' | 'general';
  channel: 'email' | 'chat' | 'phone' | 'api' | 'self_service';
  assignedTo?: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  firstResponseAt?: Date;
  metadata: {
    userAgent?: string;
    errorLogs?: string[];
    workflowId?: string;
    appIntegrations?: string[];
    customerTier: 'free' | 'professional' | 'enterprise' | 'enterprise_plus';
  };
  interactions: SupportInteraction[];
  satisfaction?: {
    rating: number; // 1-5
    feedback: string;
    submittedAt: Date;
  };
}

export interface SupportInteraction {
  id: string;
  ticketId: string;
  type: 'customer_message' | 'agent_response' | 'internal_note' | 'status_change' | 'escalation';
  content: string;
  author: {
    id: string;
    name: string;
    type: 'customer' | 'agent' | 'system';
  };
  createdAt: Date;
  attachments?: {
    filename: string;
    url: string;
    size: number;
  }[];
}

export interface KnowledgeBaseArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  subcategory: string;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedReadTime: number;
  views: number;
  upvotes: number;
  downvotes: number;
  lastUpdated: Date;
  author: {
    id: string;
    name: string;
    role: string;
  };
  relatedArticles: string[];
  searchKeywords: string[];
  isPublic: boolean;
  customerTier: 'all' | 'professional' | 'enterprise';
}

export interface CustomerHealthScore {
  customerId: string;
  overallScore: number; // 0-100
  components: {
    productUsage: number;
    featureAdoption: number;
    supportInteractions: number;
    businessValue: number;
    satisfaction: number;
  };
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: string[];
  recommendations: string[];
  lastCalculated: Date;
  trend: 'improving' | 'stable' | 'declining';
}

export interface SuccessMetrics {
  customerId: string;
  timeToValue: number; // days
  featureAdoptionRate: number; // percentage
  automationSuccessRate: number; // percentage
  supportTicketCount: number;
  avgResolutionTime: number; // hours
  customerSatisfactionScore: number; // 1-5
  renewalProbability: number; // percentage
  expansionOpportunity: number; // dollar amount
  lastUpdated: Date;
}

export class CustomerSupportService {
  
  /**
   * Create and route support ticket automatically
   */
  static async createTicket(ticketData: Partial<SupportTicket>): Promise<SupportTicket> {
    const ticket: SupportTicket = {
      id: `ticket-${Date.now()}`,
      customerId: ticketData.customerId!,
      organizationId: ticketData.organizationId!,
      title: ticketData.title!,
      description: ticketData.description!,
      priority: this.calculatePriority(ticketData),
      status: 'open',
      category: this.categorizeTicket(ticketData.title!, ticketData.description!),
      channel: ticketData.channel || 'email',
      tags: this.generateTags(ticketData.title!, ticketData.description!),
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        customerTier: await this.getCustomerTier(ticketData.customerId!),
        ...ticketData.metadata
      },
      interactions: []
    };

    // Auto-assign based on category and priority
    ticket.assignedTo = await this.autoAssignTicket(ticket);

    // Send notifications
    await this.sendTicketNotifications(ticket);

    // Create initial interaction
    ticket.interactions.push({
      id: `interaction-${Date.now()}`,
      ticketId: ticket.id,
      type: 'customer_message',
      content: ticket.description,
      author: {
        id: ticket.customerId,
        name: await this.getCustomerName(ticket.customerId),
        type: 'customer'
      },
      createdAt: new Date()
    });

    return ticket;
  }

  /**
   * Intelligent ticket categorization using keywords
   */
  private static categorizeTicket(title: string, description: string): SupportTicket['category'] {
    const content = `${title} ${description}`.toLowerCase();

    const categories = {
      technical: ['error', 'bug', 'broken', 'not working', 'api', 'integration', 'timeout', 'failed'],
      billing: ['billing', 'payment', 'invoice', 'subscription', 'charge', 'refund', 'pricing'],
      feature_request: ['feature', 'enhancement', 'request', 'suggestion', 'improvement', 'add'],
      bug_report: ['bug', 'error', 'crash', 'broken', 'issue', 'problem', 'exception'],
      onboarding: ['setup', 'getting started', 'how to', 'tutorial', 'onboarding', 'configuration']
    };

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => content.includes(keyword))) {
        return category as SupportTicket['category'];
      }
    }

    return 'general';
  }

  /**
   * Calculate ticket priority based on customer tier and content
   */
  private static calculatePriority(ticketData: Partial<SupportTicket>): SupportTicket['priority'] {
    const content = `${ticketData.title} ${ticketData.description}`.toLowerCase();
    
    // Critical keywords
    const criticalKeywords = ['down', 'outage', 'critical', 'urgent', 'production', 'security breach'];
    if (criticalKeywords.some(keyword => content.includes(keyword))) {
      return 'critical';
    }

    // High priority keywords
    const highKeywords = ['error', 'broken', 'not working', 'failed', 'timeout'];
    if (highKeywords.some(keyword => content.includes(keyword))) {
      return 'high';
    }

    // Medium priority for feature requests
    if (content.includes('feature') || content.includes('enhancement')) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Generate relevant tags for ticket
   */
  private static generateTags(title: string, description: string): string[] {
    const content = `${title} ${description}`.toLowerCase();
    const tags: string[] = [];

    // App-specific tags
    const apps = ['gmail', 'sheets', 'slack', 'salesforce', 'hubspot', 'shopify', 'stripe'];
    apps.forEach(app => {
      if (content.includes(app)) {
        tags.push(app);
      }
    });

    // Feature tags
    const features = ['ai-builder', 'graph-editor', 'workflow', 'automation', 'integration'];
    features.forEach(feature => {
      if (content.includes(feature.replace('-', ' ')) || content.includes(feature)) {
        tags.push(feature);
      }
    });

    // Technical tags
    if (content.includes('api')) tags.push('api');
    if (content.includes('webhook')) tags.push('webhook');
    if (content.includes('oauth')) tags.push('oauth');
    if (content.includes('deployment')) tags.push('deployment');

    return tags;
  }

  /**
   * Auto-assign ticket to appropriate agent
   */
  private static async autoAssignTicket(ticket: SupportTicket): Promise<string | undefined> {
    // Assignment rules based on category and priority
    const assignmentRules = {
      technical: {
        critical: 'senior-technical-lead',
        high: 'technical-specialist',
        medium: 'technical-support',
        low: 'junior-technical'
      },
      billing: {
        critical: 'billing-manager',
        high: 'billing-specialist',
        medium: 'billing-support',
        low: 'billing-support'
      },
      onboarding: {
        critical: 'customer-success-manager',
        high: 'onboarding-specialist',
        medium: 'onboarding-support',
        low: 'onboarding-support'
      }
    };

    const rule = assignmentRules[ticket.category as keyof typeof assignmentRules];
    if (rule) {
      return rule[ticket.priority];
    }

    // Default assignment for general tickets
    return 'general-support';
  }

  /**
   * Send ticket notifications to relevant parties
   */
  private static async sendTicketNotifications(ticket: SupportTicket): Promise<void> {
    // Customer confirmation
    await this.sendCustomerNotification(ticket, 'ticket_created');

    // Internal team notification
    await this.sendInternalNotification(ticket, 'new_ticket');

    // Escalation for critical tickets
    if (ticket.priority === 'critical') {
      await this.sendEscalationNotification(ticket);
    }
  }

  /**
   * Send customer notification
   */
  private static async sendCustomerNotification(
    ticket: SupportTicket, 
    type: 'ticket_created' | 'status_update' | 'resolution'
  ): Promise<void> {
    const templates = {
      ticket_created: {
        subject: `Support Ticket Created: ${ticket.id}`,
        body: `
Hello,

Thank you for contacting our support team. We've received your request and created ticket ${ticket.id}.

**Ticket Details:**
- Priority: ${ticket.priority.toUpperCase()}
- Category: ${ticket.category.replace('_', ' ').toUpperCase()}
- Status: ${ticket.status.toUpperCase()}

**Expected Response Time:**
${this.getExpectedResponseTime(ticket.priority, ticket.metadata.customerTier)}

You can track the progress of your ticket at: https://support.automationplatform.com/tickets/${ticket.id}

Best regards,
The Support Team
        `.trim()
      }
    };

    // In production, this would send actual emails
    console.log(`📧 Customer notification sent: ${type} for ticket ${ticket.id}`);
  }

  /**
   * Send internal team notification
   */
  private static async sendInternalNotification(
    ticket: SupportTicket,
    type: 'new_ticket' | 'escalation' | 'resolution'
  ): Promise<void> {
    // Slack notification to support team
    const slackMessage = {
      channel: '#customer-support',
      text: `🎫 New ${ticket.priority} priority ticket: ${ticket.title}`,
      attachments: [
        {
          color: this.getPriorityColor(ticket.priority),
          fields: [
            { title: 'Ticket ID', value: ticket.id, short: true },
            { title: 'Customer', value: ticket.customerId, short: true },
            { title: 'Category', value: ticket.category, short: true },
            { title: 'Assigned To', value: ticket.assignedTo || 'Unassigned', short: true }
          ]
        }
      ]
    };

    console.log(`📢 Slack notification sent: ${JSON.stringify(slackMessage, null, 2)}`);
  }

  /**
   * Get expected response time based on priority and customer tier
   */
  private static getExpectedResponseTime(
    priority: SupportTicket['priority'], 
    customerTier: string
  ): string {
    const sla = {
      enterprise_plus: {
        critical: '15 minutes',
        high: '1 hour',
        medium: '4 hours',
        low: '8 hours'
      },
      enterprise: {
        critical: '30 minutes',
        high: '2 hours',
        medium: '8 hours',
        low: '24 hours'
      },
      professional: {
        critical: '1 hour',
        high: '4 hours',
        medium: '24 hours',
        low: '48 hours'
      },
      free: {
        critical: '4 hours',
        high: '24 hours',
        medium: '48 hours',
        low: '72 hours'
      }
    };

    const tierSla = sla[customerTier as keyof typeof sla] || sla.free;
    return tierSla[priority];
  }

  /**
   * Get priority color for UI/notifications
   */
  private static getPriorityColor(priority: SupportTicket['priority']): string {
    const colors = {
      critical: '#ff0000',
      high: '#ff6600',
      medium: '#ffcc00',
      low: '#00cc00'
    };
    return colors[priority];
  }

  /**
   * Helper methods (would be implemented with actual data sources)
   */
  private static async getCustomerTier(customerId: string): Promise<string> {
    // In production, query customer database
    return 'enterprise';
  }

  private static async getCustomerName(customerId: string): Promise<string> {
    // In production, query customer database
    return 'Customer Name';
  }
}

export class KnowledgeBaseService {
  
  /**
   * Search knowledge base articles
   */
  static searchArticles(query: string, customerTier: string = 'all'): KnowledgeBaseArticle[] {
    // In production, this would use Elasticsearch or similar
    const sampleArticles: KnowledgeBaseArticle[] = [
      {
        id: 'kb-001',
        title: 'Getting Started with AI Builder',
        content: 'Learn how to create your first automation using natural language...',
        category: 'Getting Started',
        subcategory: 'AI Builder',
        tags: ['ai', 'automation', 'beginner'],
        difficulty: 'beginner',
        estimatedReadTime: 5,
        views: 1250,
        upvotes: 45,
        downvotes: 2,
        lastUpdated: new Date(),
        author: {
          id: 'author-1',
          name: 'Support Team',
          role: 'Documentation'
        },
        relatedArticles: ['kb-002', 'kb-003'],
        searchKeywords: ['ai builder', 'automation', 'getting started', 'natural language'],
        isPublic: true,
        customerTier: 'all'
      },
      {
        id: 'kb-002',
        title: 'Troubleshooting Gmail Integration',
        content: 'Common issues and solutions for Gmail automation...',
        category: 'Troubleshooting',
        subcategory: 'Integrations',
        tags: ['gmail', 'email', 'troubleshooting'],
        difficulty: 'intermediate',
        estimatedReadTime: 8,
        views: 890,
        upvotes: 32,
        downvotes: 1,
        lastUpdated: new Date(),
        author: {
          id: 'author-2',
          name: 'Technical Team',
          role: 'Engineering'
        },
        relatedArticles: ['kb-004', 'kb-005'],
        searchKeywords: ['gmail', 'email', 'oauth', 'authentication', 'troubleshooting'],
        isPublic: true,
        customerTier: 'all'
      }
    ];

    return sampleArticles.filter(article => 
      article.customerTier === 'all' || 
      article.customerTier === customerTier ||
      (customerTier === 'enterprise' && article.customerTier === 'professional')
    );
  }

  /**
   * Get article recommendations based on ticket content
   */
  static getArticleRecommendations(ticket: SupportTicket): KnowledgeBaseArticle[] {
    const searchTerms = [...ticket.tags, ticket.category].join(' ');
    return this.searchArticles(searchTerms, ticket.metadata.customerTier);
  }

  /**
   * Track article engagement
   */
  static trackArticleView(articleId: string, userId: string): void {
    // In production, update analytics database
    console.log(`📊 Article view tracked: ${articleId} by ${userId}`);
  }

  /**
   * Submit article feedback
   */
  static submitArticleFeedback(
    articleId: string, 
    userId: string, 
    helpful: boolean, 
    feedback?: string
  ): void {
    // In production, store feedback in database
    console.log(`👍 Article feedback: ${articleId} - ${helpful ? 'helpful' : 'not helpful'}`);
  }
}

export class CustomerHealthService {
  
  /**
   * Calculate comprehensive customer health score
   */
  static calculateHealthScore(customerId: string): CustomerHealthScore {
    // In production, this would aggregate data from multiple sources
    const mockMetrics = {
      productUsage: 85, // Active workflow usage
      featureAdoption: 70, // Feature adoption rate
      supportInteractions: 90, // Support interaction quality
      businessValue: 80, // ROI and value realization
      satisfaction: 88 // Customer satisfaction scores
    };

    const overallScore = Object.values(mockMetrics).reduce((sum, score) => sum + score, 0) / 5;
    
    const riskFactors: string[] = [];
    if (mockMetrics.productUsage < 50) riskFactors.push('Low product usage');
    if (mockMetrics.featureAdoption < 40) riskFactors.push('Poor feature adoption');
    if (mockMetrics.supportInteractions < 70) riskFactors.push('Support issues');
    if (mockMetrics.satisfaction < 70) riskFactors.push('Low satisfaction');

    let riskLevel: CustomerHealthScore['riskLevel'] = 'low';
    if (overallScore < 70) riskLevel = 'high';
    else if (overallScore < 80) riskLevel = 'medium';

    const recommendations: string[] = [];
    if (mockMetrics.featureAdoption < 60) {
      recommendations.push('Schedule feature adoption workshop');
    }
    if (mockMetrics.productUsage < 70) {
      recommendations.push('Increase automation usage through success coaching');
    }
    if (mockMetrics.satisfaction < 80) {
      recommendations.push('Conduct satisfaction survey and address concerns');
    }

    return {
      customerId,
      overallScore: Math.round(overallScore),
      components: mockMetrics,
      riskLevel,
      riskFactors,
      recommendations,
      lastCalculated: new Date(),
      trend: overallScore > 80 ? 'improving' : overallScore > 70 ? 'stable' : 'declining'
    };
  }

  /**
   * Get at-risk customers
   */
  static getAtRiskCustomers(): CustomerHealthScore[] {
    // In production, query database for customers with low health scores
    return [
      this.calculateHealthScore('customer-123'),
      this.calculateHealthScore('customer-456')
    ].filter(score => score.riskLevel === 'high' || score.riskLevel === 'critical');
  }

  /**
   * Generate success recommendations
   */
  static generateSuccessRecommendations(customerId: string): string[] {
    const healthScore = this.calculateHealthScore(customerId);
    return healthScore.recommendations;
  }
}

export class SupportAnalyticsService {
  
  /**
   * Generate support metrics dashboard
   */
  static getSupportMetrics(timeframe: '24h' | '7d' | '30d' | '90d' = '30d'): {
    totalTickets: number;
    resolvedTickets: number;
    avgResolutionTime: number;
    firstResponseTime: number;
    customerSatisfaction: number;
    ticketsByPriority: Record<string, number>;
    ticketsByCategory: Record<string, number>;
    agentPerformance: Array<{
      agentId: string;
      name: string;
      ticketsHandled: number;
      avgResolutionTime: number;
      satisfactionScore: number;
    }>;
  } {
    // In production, query actual metrics from database
    return {
      totalTickets: 145,
      resolvedTickets: 132,
      avgResolutionTime: 4.2, // hours
      firstResponseTime: 0.8, // hours
      customerSatisfaction: 4.6, // out of 5
      ticketsByPriority: {
        critical: 8,
        high: 25,
        medium: 67,
        low: 45
      },
      ticketsByCategory: {
        technical: 58,
        billing: 23,
        feature_request: 34,
        bug_report: 19,
        onboarding: 11
      },
      agentPerformance: [
        {
          agentId: 'agent-1',
          name: 'Sarah Johnson',
          ticketsHandled: 45,
          avgResolutionTime: 3.8,
          satisfactionScore: 4.8
        },
        {
          agentId: 'agent-2',
          name: 'Mike Chen',
          ticketsHandled: 38,
          avgResolutionTime: 4.2,
          satisfactionScore: 4.7
        }
      ]
    };
  }

  /**
   * Generate customer success metrics
   */
  static getCustomerSuccessMetrics(): {
    totalCustomers: number;
    healthyCustomers: number;
    atRiskCustomers: number;
    averageHealthScore: number;
    timeToValue: number;
    featureAdoption: number;
    renewalRate: number;
    expansionRevenue: number;
  } {
    return {
      totalCustomers: 245,
      healthyCustomers: 198,
      atRiskCustomers: 12,
      averageHealthScore: 82,
      timeToValue: 14, // days
      featureAdoption: 73, // percentage
      renewalRate: 94, // percentage
      expansionRevenue: 125000 // dollars
    };
  }
}

/**
 * Automated support workflows
 */
export const SUPPORT_AUTOMATIONS = {
  
  /**
   * Auto-respond to common questions
   */
  AUTO_RESPONSE: {
    trigger: 'ticket.created',
    conditions: [
      'category = "general"',
      'priority = "low"',
      'contains_common_keywords'
    ],
    actions: [
      'Send auto-response with knowledge base links',
      'Tag as "auto-handled"',
      'Set status to "waiting_customer"'
    ]
  },

  /**
   * Escalate critical issues
   */
  CRITICAL_ESCALATION: {
    trigger: 'ticket.created',
    conditions: [
      'priority = "critical"',
      'customer_tier = "enterprise_plus"'
    ],
    actions: [
      'Notify senior technical lead immediately',
      'Create Slack alert in #critical-support',
      'Send SMS to on-call engineer',
      'Schedule follow-up in 15 minutes'
    ]
  },

  /**
   * Follow up on unresolved tickets
   */
  FOLLOW_UP_SEQUENCE: {
    trigger: 'time.schedule',
    conditions: [
      'status = "waiting_customer"',
      'last_interaction > 48_hours'
    ],
    actions: [
      'Send follow-up email to customer',
      'Internal reminder to assigned agent',
      'Update ticket priority if no response in 24h'
    ]
  },

  /**
   * Collect satisfaction feedback
   */
  SATISFACTION_SURVEY: {
    trigger: 'ticket.resolved',
    conditions: [
      'resolution_time < 24_hours',
      'customer_tier != "free"'
    ],
    actions: [
      'Send satisfaction survey email',
      'Schedule follow-up if rating < 4',
      'Add positive feedback to testimonials'
    ]
  },

  /**
   * Proactive health monitoring
   */
  HEALTH_MONITORING: {
    trigger: 'time.daily',
    conditions: [
      'customer_health_score < 70',
      'no_recent_success_interaction'
    ],
    actions: [
      'Alert customer success manager',
      'Schedule proactive outreach',
      'Create improvement plan',
      'Track intervention results'
    ]
  }
};

export default CustomerSupportService;