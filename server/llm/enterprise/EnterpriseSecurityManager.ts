/**
 * EnterpriseSecurityManager - Advanced security for enterprise LLM operations
 * Includes PII detection, data classification, audit trails, and compliance monitoring
 */

export interface SecurityProfile {
  userId: string;
  accessLevel: 'basic' | 'elevated' | 'admin' | 'super_admin';
  clearanceLevel: 'public' | 'internal' | 'confidential' | 'restricted' | 'top_secret';
  permissions: string[];
  complianceRequirements: string[]; // ['GDPR', 'HIPAA', 'SOX', 'PCI_DSS']
  dataResidencyRestrictions: string[]; // ['US', 'EU', 'UK']
  allowedProviders: string[];
  costLimits: {
    daily: number;
    monthly: number;
    perRequest: number;
  };
}

export interface PIIDetectionResult {
  hasPII: boolean;
  confidence: number;
  detectedTypes: Array<{
    type: 'ssn' | 'credit_card' | 'email' | 'phone' | 'address' | 'name' | 'passport' | 'license';
    matches: Array<{
      text: string;
      startIndex: number;
      endIndex: number;
      confidence: number;
    }>;
  }>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
}

export interface DataClassification {
  level: 'public' | 'internal' | 'confidential' | 'restricted';
  categories: string[];
  sensitivity: number; // 0-1
  retentionPeriod: number; // days
  geographicRestrictions: string[];
  complianceFlags: string[];
  reasoning: string;
}

export interface SecurityAuditEntry {
  id: string;
  timestamp: number;
  userId?: string;
  action: string;
  resource: string;
  outcome: 'allowed' | 'denied' | 'flagged';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  details: {
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    requestId?: string;
    dataClassification?: DataClassification;
    piiDetection?: PIIDetectionResult;
    complianceViolations?: string[];
  };
  metadata: Record<string, any>;
}

export interface ComplianceRule {
  id: string;
  name: string;
  description: string;
  framework: 'GDPR' | 'HIPAA' | 'SOX' | 'PCI_DSS' | 'CCPA' | 'ISO27001';
  severity: 'low' | 'medium' | 'high' | 'critical';
  condition: (context: any) => boolean;
  action: 'log' | 'block' | 'redact' | 'encrypt' | 'notify';
  message: string;
}

class PIIDetector {
  private patterns = {
    ssn: /\b(?:\d{3}-?\d{2}-?\d{4}|\d{9})\b/g,
    credit_card: /\b(?:\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}|\d{13,19})\b/g,
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    phone: /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
    passport: /\b[A-Z]{2}\d{7}\b/g,
    license: /\b[A-Z]\d{7,8}\b/g
  };

  private nameIndicators = [
    'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'first name', 'last name', 'full name'
  ];

  async detectPII(text: string): Promise<PIIDetectionResult> {
    const detectedTypes: PIIDetectionResult['detectedTypes'] = [];
    let totalConfidence = 0;
    let riskScore = 0;

    // Check each pattern
    for (const [type, pattern] of Object.entries(this.patterns)) {
      const matches = Array.from(text.matchAll(pattern));
      
      if (matches.length > 0) {
        const typeMatches = matches.map(match => ({
          text: match[0],
          startIndex: match.index!,
          endIndex: match.index! + match[0].length,
          confidence: this.calculateConfidence(type, match[0])
        }));

        detectedTypes.push({
          type: type as any,
          matches: typeMatches
        });

        // Update risk scoring
        const typeRisk = this.getTypeRiskScore(type);
        riskScore = Math.max(riskScore, typeRisk);
        totalConfidence += typeMatches.reduce((sum, m) => sum + m.confidence, 0) / typeMatches.length;
      }
    }

    // Check for name patterns
    const nameMatches = this.detectNames(text);
    if (nameMatches.length > 0) {
      detectedTypes.push({
        type: 'name',
        matches: nameMatches
      });
      riskScore = Math.max(riskScore, 0.6);
    }

    const hasPII = detectedTypes.length > 0;
    const confidence = detectedTypes.length > 0 ? totalConfidence / detectedTypes.length : 0;
    
    return {
      hasPII,
      confidence,
      detectedTypes,
      riskLevel: this.calculateRiskLevel(riskScore),
      recommendations: this.generateRecommendations(detectedTypes, riskScore)
    };
  }

  private calculateConfidence(type: string, text: string): number {
    // Simplified confidence calculation
    const confidenceMap: Record<string, number> = {
      'ssn': 0.95,
      'credit_card': 0.90,
      'email': 0.98,
      'phone': 0.85,
      'passport': 0.92,
      'license': 0.80
    };

    return confidenceMap[type] || 0.7;
  }

  private getTypeRiskScore(type: string): number {
    const riskMap: Record<string, number> = {
      'ssn': 1.0,
      'credit_card': 1.0,
      'passport': 0.95,
      'license': 0.8,
      'phone': 0.6,
      'email': 0.5,
      'name': 0.4
    };

    return riskMap[type] || 0.3;
  }

  private detectNames(text: string): Array<{ text: string; startIndex: number; endIndex: number; confidence: number }> {
    const nameMatches = [];
    
    // Simple name detection based on capitalization patterns
    const namePattern = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g;
    const matches = Array.from(text.matchAll(namePattern));
    
    for (const match of matches) {
      // Check if it's likely a name (not just capitalized words)
      const isLikelyName = this.nameIndicators.some(indicator => 
        text.toLowerCase().includes(indicator.toLowerCase())
      );
      
      nameMatches.push({
        text: match[0],
        startIndex: match.index!,
        endIndex: match.index! + match[0].length,
        confidence: isLikelyName ? 0.8 : 0.4
      });
    }
    
    return nameMatches;
  }

  private calculateRiskLevel(riskScore: number): 'low' | 'medium' | 'high' | 'critical' {
    if (riskScore >= 0.9) return 'critical';
    if (riskScore >= 0.7) return 'high';
    if (riskScore >= 0.4) return 'medium';
    return 'low';
  }

  private generateRecommendations(detectedTypes: any[], riskScore: number): string[] {
    const recommendations = [];
    
    if (riskScore >= 0.9) {
      recommendations.push('Block processing due to high-risk PII detected');
      recommendations.push('Require explicit user consent before proceeding');
    } else if (riskScore >= 0.7) {
      recommendations.push('Apply data redaction before LLM processing');
      recommendations.push('Use on-premises or private cloud deployment');
    } else if (riskScore >= 0.4) {
      recommendations.push('Log PII detection for audit purposes');
      recommendations.push('Consider data anonymization techniques');
    }
    
    if (detectedTypes.some(t => t.type === 'ssn' || t.type === 'credit_card')) {
      recommendations.push('Compliance review required');
      recommendations.push('Enable encryption at rest and in transit');
    }
    
    return recommendations;
  }
}

class DataClassifier {
  private classificationRules = [
    {
      keywords: ['password', 'secret', 'api key', 'token', 'private key'],
      level: 'restricted' as const,
      category: 'authentication'
    },
    {
      keywords: ['medical', 'health', 'patient', 'diagnosis', 'treatment'],
      level: 'confidential' as const,
      category: 'healthcare'
    },
    {
      keywords: ['financial', 'bank', 'account', 'transaction', 'payment'],
      level: 'confidential' as const,
      category: 'financial'
    },
    {
      keywords: ['personal', 'address', 'phone', 'email', 'name'],
      level: 'internal' as const,
      category: 'personal_data'
    }
  ];

  classifyData(text: string, context?: any): DataClassification {
    const textLower = text.toLowerCase();
    let maxLevel = 'public';
    const categories = [];
    let sensitivity = 0;

    // Apply classification rules
    for (const rule of this.classificationRules) {
      const hasKeywords = rule.keywords.some(keyword => textLower.includes(keyword));
      
      if (hasKeywords) {
        categories.push(rule.category);
        
        // Escalate classification level
        const levelPriority = { 'public': 0, 'internal': 1, 'confidential': 2, 'restricted': 3 };
        if (levelPriority[rule.level] > levelPriority[maxLevel]) {
          maxLevel = rule.level;
        }
        
        sensitivity = Math.max(sensitivity, this.getLevelSensitivity(rule.level));
      }
    }

    // Context-based classification
    if (context?.source === 'user_input') {
      sensitivity = Math.max(sensitivity, 0.3);
    }
    
    if (context?.compliance?.includes('HIPAA')) {
      maxLevel = 'confidential';
      sensitivity = Math.max(sensitivity, 0.8);
    }

    return {
      level: maxLevel as any,
      categories: [...new Set(categories)],
      sensitivity,
      retentionPeriod: this.getRetentionPeriod(maxLevel),
      geographicRestrictions: this.getGeographicRestrictions(maxLevel),
      complianceFlags: this.getComplianceFlags(categories),
      reasoning: this.generateReasoning(categories, maxLevel)
    };
  }

  private getLevelSensitivity(level: string): number {
    const sensitivityMap: Record<string, number> = {
      'public': 0.1,
      'internal': 0.4,
      'confidential': 0.7,
      'restricted': 1.0
    };
    return sensitivityMap[level] || 0.1;
  }

  private getRetentionPeriod(level: string): number {
    const retentionMap: Record<string, number> = {
      'public': 365 * 5, // 5 years
      'internal': 365 * 3, // 3 years
      'confidential': 365 * 2, // 2 years
      'restricted': 365 // 1 year
    };
    return retentionMap[level] || 365;
  }

  private getGeographicRestrictions(level: string): string[] {
    if (level === 'restricted') return ['home_country'];
    if (level === 'confidential') return ['approved_regions'];
    return [];
  }

  private getComplianceFlags(categories: string[]): string[] {
    const flags = [];
    if (categories.includes('healthcare')) flags.push('HIPAA');
    if (categories.includes('financial')) flags.push('PCI_DSS', 'SOX');
    if (categories.includes('personal_data')) flags.push('GDPR', 'CCPA');
    return flags;
  }

  private generateReasoning(categories: string[], level: string): string {
    if (categories.length === 0) return 'No sensitive content detected';
    return `Classified as ${level} due to presence of: ${categories.join(', ')}`;
  }
}

class ComplianceEngine {
  private rules: ComplianceRule[] = [
    {
      id: 'gdpr_pii_processing',
      name: 'GDPR PII Processing',
      description: 'Ensures PII processing complies with GDPR requirements',
      framework: 'GDPR',
      severity: 'high',
      condition: (context) => context.hasPII && context.userLocation?.startsWith('EU'),
      action: 'block',
      message: 'PII processing requires explicit consent under GDPR'
    },
    {
      id: 'hipaa_phi_protection',
      name: 'HIPAA PHI Protection',
      description: 'Protects Protected Health Information under HIPAA',
      framework: 'HIPAA',
      severity: 'critical',
      condition: (context) => context.dataClassification?.categories?.includes('healthcare'),
      action: 'encrypt',
      message: 'Healthcare data must be encrypted and access logged'
    },
    {
      id: 'pci_dss_cardholder_data',
      name: 'PCI DSS Cardholder Data',
      description: 'Protects cardholder data per PCI DSS requirements',
      framework: 'PCI_DSS',
      severity: 'critical',
      condition: (context) => context.piiDetection?.detectedTypes?.some(t => t.type === 'credit_card'),
      action: 'block',
      message: 'Credit card data processing requires PCI DSS compliance'
    }
  ];

  evaluateCompliance(context: any): { violations: any[]; actions: string[] } {
    const violations = [];
    const actions = [];

    for (const rule of this.rules) {
      try {
        if (rule.condition(context)) {
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            framework: rule.framework,
            severity: rule.severity,
            message: rule.message,
            action: rule.action
          });
          
          actions.push(rule.action);
        }
      } catch (error) {
        console.error(`Error evaluating compliance rule ${rule.id}:`, error);
      }
    }

    return { violations, actions };
  }

  addCustomRule(rule: ComplianceRule): void {
    this.rules.push(rule);
  }
}

class SecurityAuditor {
  private auditLog: SecurityAuditEntry[] = [];
  private maxLogSize = 100000;

  logSecurityEvent(
    action: string,
    resource: string,
    outcome: 'allowed' | 'denied' | 'flagged',
    details: any,
    userId?: string
  ): void {
    const entry: SecurityAuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      userId,
      action,
      resource,
      outcome,
      riskLevel: this.calculateRiskLevel(action, outcome, details),
      details,
      metadata: {
        source: 'security_manager',
        version: '1.0'
      }
    };

    this.auditLog.push(entry);

    // Trim log if too large
    if (this.auditLog.length > this.maxLogSize) {
      this.auditLog = this.auditLog.slice(-this.maxLogSize);
    }

    // Log high-risk events immediately
    if (entry.riskLevel === 'high' || entry.riskLevel === 'critical') {
      console.warn(`🚨 High-risk security event: ${action} - ${outcome}`, entry);
    }
  }

  private calculateRiskLevel(action: string, outcome: string, details: any): 'low' | 'medium' | 'high' | 'critical' {
    let riskScore = 0;

    // Action-based risk
    if (action.includes('admin') || action.includes('delete')) riskScore += 0.3;
    if (action.includes('export') || action.includes('download')) riskScore += 0.2;

    // Outcome-based risk
    if (outcome === 'denied') riskScore += 0.4;
    if (outcome === 'flagged') riskScore += 0.3;

    // Details-based risk
    if (details.piiDetection?.riskLevel === 'critical') riskScore += 0.5;
    if (details.complianceViolations?.length > 0) riskScore += 0.4;

    if (riskScore >= 0.8) return 'critical';
    if (riskScore >= 0.6) return 'high';
    if (riskScore >= 0.3) return 'medium';
    return 'low';
  }

  getAuditLog(filters?: {
    userId?: string;
    action?: string;
    outcome?: string;
    riskLevel?: string;
    timeRange?: { start: number; end: number };
  }): SecurityAuditEntry[] {
    let filtered = [...this.auditLog];

    if (filters) {
      if (filters.userId) {
        filtered = filtered.filter(entry => entry.userId === filters.userId);
      }
      if (filters.action) {
        filtered = filtered.filter(entry => entry.action.includes(filters.action!));
      }
      if (filters.outcome) {
        filtered = filtered.filter(entry => entry.outcome === filters.outcome);
      }
      if (filters.riskLevel) {
        filtered = filtered.filter(entry => entry.riskLevel === filters.riskLevel);
      }
      if (filters.timeRange) {
        filtered = filtered.filter(entry => 
          entry.timestamp >= filters.timeRange!.start && 
          entry.timestamp <= filters.timeRange!.end
        );
      }
    }

    return filtered.sort((a, b) => b.timestamp - a.timestamp);
  }
}

export class EnterpriseSecurityManager {
  private piiDetector = new PIIDetector();
  private dataClassifier = new DataClassifier();
  private complianceEngine = new ComplianceEngine();
  private auditor = new SecurityAuditor();
  private securityProfiles = new Map<string, SecurityProfile>();

  /**
   * Comprehensive security assessment of LLM request
   */
  async assessSecurity(
    request: {
      prompt: string;
      context?: any;
      userId?: string;
      userLocation?: string;
      metadata?: any;
    }
  ): Promise<{
    allowed: boolean;
    piiDetection: PIIDetectionResult;
    dataClassification: DataClassification;
    complianceViolations: any[];
    actions: string[];
    redactedPrompt?: string;
    reasoning: string;
  }> {
    try {
      // Step 1: PII Detection
      const piiDetection = await this.piiDetector.detectPII(request.prompt);

      // Step 2: Data Classification
      const dataClassification = this.dataClassifier.classifyData(request.prompt, request.context);

      // Step 3: User Security Profile Check
      const userProfile = request.userId ? this.securityProfiles.get(request.userId) : undefined;

      // Step 4: Compliance Evaluation
      const complianceContext = {
        hasPII: piiDetection.hasPII,
        piiDetection,
        dataClassification,
        userLocation: request.userLocation,
        userProfile,
        requestMetadata: request.metadata
      };

      const { violations: complianceViolations, actions } = this.complianceEngine.evaluateCompliance(complianceContext);

      // Step 5: Make access decision
      const blockingActions = ['block', 'deny'];
      const shouldBlock = actions.some(action => blockingActions.includes(action)) || 
                         piiDetection.riskLevel === 'critical' ||
                         (userProfile && !this.checkUserPermissions(userProfile, dataClassification));

      const allowed = !shouldBlock;

      // Step 6: Apply redaction if needed
      let redactedPrompt = request.prompt;
      if (actions.includes('redact')) {
        redactedPrompt = this.redactPII(request.prompt, piiDetection);
      }

      // Step 7: Generate reasoning
      const reasoning = this.generateSecurityReasoning(allowed, piiDetection, dataClassification, complianceViolations);

      // Step 8: Log security event
      this.auditor.logSecurityEvent(
        'llm_request_assessment',
        'llm_api',
        allowed ? 'allowed' : 'denied',
        {
          piiDetection,
          dataClassification,
          complianceViolations,
          userProfile: userProfile?.accessLevel
        },
        request.userId
      );

      return {
        allowed,
        piiDetection,
        dataClassification,
        complianceViolations,
        actions,
        redactedPrompt: redactedPrompt !== request.prompt ? redactedPrompt : undefined,
        reasoning
      };

    } catch (error) {
      console.error('Security assessment failed:', error);
      
      // Fail secure - deny access on error
      return {
        allowed: false,
        piiDetection: { hasPII: false, confidence: 0, detectedTypes: [], riskLevel: 'low', recommendations: [] },
        dataClassification: { level: 'restricted', categories: [], sensitivity: 1, retentionPeriod: 365, geographicRestrictions: [], complianceFlags: [], reasoning: 'Security assessment failed' },
        complianceViolations: [],
        actions: ['block'],
        reasoning: 'Access denied due to security assessment error'
      };
    }
  }

  private checkUserPermissions(profile: SecurityProfile, classification: DataClassification): boolean {
    // Check clearance level
    const clearanceLevels = ['public', 'internal', 'confidential', 'restricted', 'top_secret'];
    const userClearance = clearanceLevels.indexOf(profile.clearanceLevel);
    const requiredClearance = clearanceLevels.indexOf(classification.level);
    
    if (userClearance < requiredClearance) {
      return false;
    }

    // Check compliance requirements
    const hasRequiredCompliance = classification.complianceFlags.every(flag => 
      profile.complianceRequirements.includes(flag)
    );

    return hasRequiredCompliance;
  }

  private redactPII(text: string, piiDetection: PIIDetectionResult): string {
    let redacted = text;
    
    // Sort matches by position (descending) to avoid index shifting
    const allMatches = piiDetection.detectedTypes
      .flatMap(type => type.matches.map(match => ({ ...match, type: type.type })))
      .sort((a, b) => b.startIndex - a.startIndex);

    for (const match of allMatches) {
      const replacement = `[REDACTED_${match.type.toUpperCase()}]`;
      redacted = redacted.substring(0, match.startIndex) + replacement + redacted.substring(match.endIndex);
    }

    return redacted;
  }

  private generateSecurityReasoning(
    allowed: boolean,
    piiDetection: PIIDetectionResult,
    classification: DataClassification,
    violations: any[]
  ): string {
    const reasons = [];

    if (!allowed) {
      if (violations.length > 0) {
        reasons.push(`Compliance violations: ${violations.map(v => v.framework).join(', ')}`);
      }
      if (piiDetection.riskLevel === 'critical') {
        reasons.push('Critical PII detected');
      }
      if (classification.level === 'restricted') {
        reasons.push('Restricted data classification');
      }
    } else {
      reasons.push('Security assessment passed');
      if (piiDetection.hasPII) {
        reasons.push(`PII detected but within acceptable risk (${piiDetection.riskLevel})`);
      }
    }

    return reasons.join('; ');
  }

  /**
   * Register user security profile
   */
  registerSecurityProfile(profile: SecurityProfile): void {
    this.securityProfiles.set(profile.userId, profile);
    console.log(`🔐 Registered security profile for user: ${profile.userId} (${profile.accessLevel})`);
  }

  /**
   * Get security audit log
   */
  getSecurityAuditLog(filters?: any): SecurityAuditEntry[] {
    return this.auditor.getAuditLog(filters);
  }

  /**
   * Get security analytics
   */
  getSecurityAnalytics(): any {
    const auditLog = this.auditor.getAuditLog();
    const last24h = Date.now() - (24 * 60 * 60 * 1000);
    const recentEvents = auditLog.filter(entry => entry.timestamp > last24h);

    return {
      totalEvents: auditLog.length,
      recentEvents: recentEvents.length,
      riskDistribution: this.calculateRiskDistribution(recentEvents),
      complianceViolations: recentEvents.filter(e => e.details.complianceViolations?.length > 0).length,
      piiDetections: recentEvents.filter(e => e.details.piiDetection?.hasPII).length,
      blockedRequests: recentEvents.filter(e => e.outcome === 'denied').length
    };
  }

  private calculateRiskDistribution(events: SecurityAuditEntry[]): Record<string, number> {
    const distribution = { low: 0, medium: 0, high: 0, critical: 0 };
    events.forEach(event => {
      distribution[event.riskLevel]++;
    });
    return distribution;
  }
}

export const enterpriseSecurityManager = new EnterpriseSecurityManager();