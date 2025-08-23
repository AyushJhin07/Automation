import { Request, Response, NextFunction } from 'express';
import { healthMonitoringService } from './HealthMonitoringService';

export interface SecurityEvent {
  id: string;
  type: 'suspicious_activity' | 'rate_limit_exceeded' | 'invalid_input' | 'unauthorized_access' | 'injection_attempt';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  ipAddress: string;
  userAgent?: string;
  endpoint: string;
  details: Record<string, any>;
  timestamp: Date;
  blocked: boolean;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}

export interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'email' | 'url' | 'uuid' | 'json' | 'array';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  sanitize?: boolean;
  allowedValues?: any[];
}

export class SecurityService {
  private securityEvents: SecurityEvent[] = [];
  private rateLimitStore = new Map<string, { count: number; resetTime: number }>();
  private suspiciousIPs = new Set<string>();
  private blockedIPs = new Set<string>();
  
  // Security patterns
  private readonly SQL_INJECTION_PATTERNS = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
    /(\b(OR|AND)\s+\d+\s*=\s*\d+)/i,
    /(\'|\"|;|--|\*|\/\*|\*\/)/,
    /(\bSCRIPT\b|\bONLOAD\b|\bONERROR\b)/i
  ];

  private readonly XSS_PATTERNS = [
    /<script[^>]*>.*?<\/script>/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<img[^>]+src[^>]*>/gi
  ];

  private readonly COMMAND_INJECTION_PATTERNS = [
    /(\||&|;|\$\(|\`)/,
    /(rm\s|wget\s|curl\s|nc\s|netcat\s)/i,
    /(\/bin\/|\/usr\/bin\/|\/sbin\/)/,
    /(sudo\s|su\s)/i
  ];

  constructor() {
    console.log('🛡️ Security service initialized');
    this.startSecurityMonitoring();
  }

  /**
   * Advanced rate limiting middleware
   */
  public createRateLimiter(config: RateLimitConfig) {
    return (req: Request, res: Response, next: NextFunction) => {
      const key = config.keyGenerator ? config.keyGenerator(req) : this.getClientKey(req);
      const now = Date.now();
      
      // Check if IP is blocked
      if (this.blockedIPs.has(this.getClientIP(req))) {
        this.logSecurityEvent({
          type: 'unauthorized_access',
          severity: 'high',
          ipAddress: this.getClientIP(req),
          userAgent: req.headers['user-agent'],
          endpoint: req.path,
          details: { reason: 'Blocked IP address' },
          blocked: true
        });
        
        return res.status(403).json({
          success: false,
          error: 'Access denied',
          code: 'IP_BLOCKED'
        });
      }

      const rateLimitData = this.rateLimitStore.get(key);
      
      if (!rateLimitData || now > rateLimitData.resetTime) {
        // Reset or create new limit
        this.rateLimitStore.set(key, {
          count: 1,
          resetTime: now + config.windowMs
        });
        return next();
      }
      
      if (rateLimitData.count >= config.maxRequests) {
        // Rate limit exceeded
        this.logSecurityEvent({
          type: 'rate_limit_exceeded',
          severity: 'medium',
          userId: req.user?.id,
          ipAddress: this.getClientIP(req),
          userAgent: req.headers['user-agent'],
          endpoint: req.path,
          details: { 
            limit: config.maxRequests,
            window: config.windowMs,
            current: rateLimitData.count
          },
          blocked: true
        });

        // Mark IP as suspicious after multiple rate limit violations
        this.markSuspiciousActivity(this.getClientIP(req));
        
        return res.status(429).json({
          success: false,
          error: 'Too many requests',
          retryAfter: Math.ceil((rateLimitData.resetTime - now) / 1000),
          code: 'RATE_LIMIT_EXCEEDED'
        });
      }
      
      rateLimitData.count++;
      next();
    };
  }

  /**
   * Input validation and sanitization middleware
   */
  public validateInput(rules: ValidationRule[]) {
    return (req: Request, res: Response, next: NextFunction) => {
      const errors: string[] = [];
      const data = { ...req.body, ...req.query, ...req.params };

      for (const rule of rules) {
        const value = data[rule.field];
        
        // Check required fields
        if (rule.required && (value === undefined || value === null || value === '')) {
          errors.push(`Field '${rule.field}' is required`);
          continue;
        }

        if (value === undefined || value === null) continue;

        // Type validation
        const typeValidation = this.validateType(value, rule.type);
        if (!typeValidation.valid) {
          errors.push(`Field '${rule.field}' ${typeValidation.error}`);
          continue;
        }

        // Length validation
        if (rule.minLength && typeof value === 'string' && value.length < rule.minLength) {
          errors.push(`Field '${rule.field}' must be at least ${rule.minLength} characters`);
        }

        if (rule.maxLength && typeof value === 'string' && value.length > rule.maxLength) {
          errors.push(`Field '${rule.field}' must be no more than ${rule.maxLength} characters`);
        }

        // Pattern validation
        if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
          errors.push(`Field '${rule.field}' has invalid format`);
        }

        // Allowed values validation
        if (rule.allowedValues && !rule.allowedValues.includes(value)) {
          errors.push(`Field '${rule.field}' must be one of: ${rule.allowedValues.join(', ')}`);
        }

        // Security checks
        if (typeof value === 'string') {
          const securityCheck = this.checkForMaliciousContent(value, rule.field);
          if (!securityCheck.safe) {
            this.logSecurityEvent({
              type: 'injection_attempt',
              severity: 'high',
              userId: req.user?.id,
              ipAddress: this.getClientIP(req),
              userAgent: req.headers['user-agent'],
              endpoint: req.path,
              details: {
                field: rule.field,
                threat: securityCheck.threat,
                value: value.substring(0, 100) // Log first 100 chars only
              },
              blocked: true
            });
            
            errors.push(`Field '${rule.field}' contains potentially malicious content`);
          }

          // Sanitize if requested
          if (rule.sanitize) {
            data[rule.field] = this.sanitizeInput(value);
          }
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors,
          code: 'VALIDATION_ERROR'
        });
      }

      // Update request with sanitized data
      req.body = { ...req.body, ...data };
      next();
    };
  }

  /**
   * Security headers middleware
   */
  public securityHeaders() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Prevent XSS attacks
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      
      // HTTPS enforcement
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      
      // Content Security Policy
      res.setHeader('Content-Security-Policy', 
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:; font-src 'self' https:; object-src 'none'; media-src 'self'; frame-src 'none';"
      );
      
      // Referrer Policy
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      
      // Permissions Policy
      res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
      
      next();
    };
  }

  /**
   * Request logging and monitoring middleware
   */
  public requestMonitoring() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      const clientIP = this.getClientIP(req);
      
      // Check for suspicious patterns in URL
      if (this.containsSuspiciousPatterns(req.url)) {
        this.logSecurityEvent({
          type: 'suspicious_activity',
          severity: 'medium',
          userId: req.user?.id,
          ipAddress: clientIP,
          userAgent: req.headers['user-agent'],
          endpoint: req.path,
          details: { 
            url: req.url,
            method: req.method,
            reason: 'Suspicious URL pattern'
          },
          blocked: false
        });
      }

      // Monitor response
      res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        
        // Record metrics
        healthMonitoringService.recordApiRequest(responseTime, res.statusCode >= 400);
        
        // Log suspicious response patterns
        if (res.statusCode === 401 || res.statusCode === 403) {
          this.markSuspiciousActivity(clientIP);
        }
      });

      next();
    };
  }

  /**
   * Check for malicious content in input
   */
  private checkForMaliciousContent(input: string, field: string): { safe: boolean; threat?: string } {
    // Check for SQL injection
    for (const pattern of this.SQL_INJECTION_PATTERNS) {
      if (pattern.test(input)) {
        return { safe: false, threat: 'sql_injection' };
      }
    }

    // Check for XSS
    for (const pattern of this.XSS_PATTERNS) {
      if (pattern.test(input)) {
        return { safe: false, threat: 'xss' };
      }
    }

    // Check for command injection
    for (const pattern of this.COMMAND_INJECTION_PATTERNS) {
      if (pattern.test(input)) {
        return { safe: false, threat: 'command_injection' };
      }
    }

    // Check for path traversal
    if (input.includes('../') || input.includes('..\\') || input.includes('%2e%2e')) {
      return { safe: false, threat: 'path_traversal' };
    }

    // Check for LDAP injection
    if (/(\(|\)|&|\||!|=|\*|<|>|~)/.test(input) && field.toLowerCase().includes('search')) {
      return { safe: false, threat: 'ldap_injection' };
    }

    return { safe: true };
  }

  /**
   * Sanitize input string
   */
  private sanitizeInput(input: string): string {
    return input
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/['"]/g, '') // Remove quotes
      .replace(/[;&|`$()]/g, '') // Remove command injection chars
      .replace(/javascript:/gi, '') // Remove javascript protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim();
  }

  /**
   * Validate input type
   */
  private validateType(value: any, type: string): { valid: boolean; error?: string } {
    switch (type) {
      case 'string':
        if (typeof value !== 'string') {
          return { valid: false, error: 'must be a string' };
        }
        break;
      
      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          return { valid: false, error: 'must be a valid number' };
        }
        break;
      
      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (typeof value !== 'string' || !emailRegex.test(value)) {
          return { valid: false, error: 'must be a valid email address' };
        }
        break;
      
      case 'url':
        try {
          new URL(value);
        } catch {
          return { valid: false, error: 'must be a valid URL' };
        }
        break;
      
      case 'uuid':
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (typeof value !== 'string' || !uuidRegex.test(value)) {
          return { valid: false, error: 'must be a valid UUID' };
        }
        break;
      
      case 'json':
        if (typeof value === 'string') {
          try {
            JSON.parse(value);
          } catch {
            return { valid: false, error: 'must be valid JSON' };
          }
        } else if (typeof value !== 'object') {
          return { valid: false, error: 'must be a valid JSON object' };
        }
        break;
      
      case 'array':
        if (!Array.isArray(value)) {
          return { valid: false, error: 'must be an array' };
        }
        break;
    }

    return { valid: true };
  }

  /**
   * Check for suspicious URL patterns
   */
  private containsSuspiciousPatterns(url: string): boolean {
    const suspiciousPatterns = [
      /\.\.\//, // Path traversal
      /\/etc\/passwd/, // System file access
      /\/proc\//, // Process information
      /\/admin/, // Admin access attempts
      /\/wp-admin/, // WordPress admin
      /\/phpmyadmin/, // Database admin
      /\.php$/, // PHP file access
      /\.asp$/, // ASP file access
      /\.jsp$/, // JSP file access
      /\/cgi-bin\//, // CGI access
      /\/\.git\//, // Git repository access
      /\/\.env/, // Environment file access
      /\/config\//, // Configuration access
      /\/backup\//, // Backup file access
      /\/test\//, // Test endpoint access
      /\/debug\//, // Debug endpoint access
    ];

    return suspiciousPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Get client IP address
   */
  private getClientIP(req: Request): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
           req.headers['x-real-ip'] as string ||
           req.connection.remoteAddress ||
           req.socket.remoteAddress ||
           'unknown';
  }

  /**
   * Generate client key for rate limiting
   */
  private getClientKey(req: Request): string {
    return req.user?.id || this.getClientIP(req);
  }

  /**
   * Mark suspicious activity
   */
  private markSuspiciousActivity(ipAddress: string): void {
    this.suspiciousIPs.add(ipAddress);
    
    // Auto-block IPs with too many suspicious activities
    const suspiciousCount = this.securityEvents.filter(
      event => event.ipAddress === ipAddress && 
               event.timestamp > new Date(Date.now() - 3600000) // Last hour
    ).length;

    if (suspiciousCount >= 10) {
      this.blockedIPs.add(ipAddress);
      console.log(`🚫 IP ${ipAddress} automatically blocked due to suspicious activity`);
      
      healthMonitoringService.createAlert(
        'error',
        'IP Address Auto-Blocked',
        `IP ${ipAddress} was automatically blocked due to ${suspiciousCount} suspicious activities in the last hour`
      );
    }
  }

  /**
   * Log security event
   */
  private logSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): void {
    const securityEvent: SecurityEvent = {
      id: `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      ...event
    };

    this.securityEvents.push(securityEvent);

    // Keep only last 10000 events
    if (this.securityEvents.length > 10000) {
      this.securityEvents = this.securityEvents.slice(-10000);
    }

    console.log(`🛡️ Security event: ${event.type} (${event.severity}) from ${event.ipAddress}`);

    // Create health monitoring alert for high/critical events
    if (event.severity === 'high' || event.severity === 'critical') {
      healthMonitoringService.createAlert(
        event.severity === 'critical' ? 'error' : 'warning',
        `Security Event: ${event.type}`,
        `${event.type} detected from IP ${event.ipAddress} on ${event.endpoint}`
      );
    }
  }

  /**
   * Get security events
   */
  public getSecurityEvents(limit: number = 100): SecurityEvent[] {
    return this.securityEvents
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get security statistics
   */
  public getSecurityStats(): {
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsBySeverity: Record<string, number>;
    blockedIPs: number;
    suspiciousIPs: number;
    recentEvents: number;
  } {
    const recentEvents = this.securityEvents.filter(
      event => event.timestamp > new Date(Date.now() - 3600000) // Last hour
    );

    const eventsByType = this.securityEvents.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const eventsBySeverity = this.securityEvents.reduce((acc, event) => {
      acc[event.severity] = (acc[event.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalEvents: this.securityEvents.length,
      eventsByType,
      eventsBySeverity,
      blockedIPs: this.blockedIPs.size,
      suspiciousIPs: this.suspiciousIPs.size,
      recentEvents: recentEvents.length
    };
  }

  /**
   * Manually block IP address
   */
  public blockIP(ipAddress: string, reason: string): void {
    this.blockedIPs.add(ipAddress);
    
    this.logSecurityEvent({
      type: 'unauthorized_access',
      severity: 'high',
      ipAddress,
      endpoint: 'manual',
      details: { reason: `Manually blocked: ${reason}` },
      blocked: true
    });

    console.log(`🚫 IP ${ipAddress} manually blocked: ${reason}`);
  }

  /**
   * Unblock IP address
   */
  public unblockIP(ipAddress: string): void {
    this.blockedIPs.delete(ipAddress);
    this.suspiciousIPs.delete(ipAddress);
    console.log(`✅ IP ${ipAddress} unblocked`);
  }

  /**
   * Start security monitoring
   */
  private startSecurityMonitoring(): void {
    // Clean up old events every hour
    setInterval(() => {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      this.securityEvents = this.securityEvents.filter(event => event.timestamp > cutoff);
      
      // Clean up rate limit store
      const now = Date.now();
      for (const [key, data] of this.rateLimitStore.entries()) {
        if (now > data.resetTime) {
          this.rateLimitStore.delete(key);
        }
      }
    }, 3600000); // 1 hour

    // Reset suspicious IPs daily
    setInterval(() => {
      this.suspiciousIPs.clear();
      console.log('🔄 Suspicious IPs list cleared');
    }, 24 * 60 * 60 * 1000); // 24 hours
  }

  /**
   * Generate security report
   */
  public generateSecurityReport(): {
    summary: string;
    stats: ReturnType<typeof this.getSecurityStats>;
    recentThreats: SecurityEvent[];
    recommendations: string[];
  } {
    const stats = this.getSecurityStats();
    const recentThreats = this.securityEvents
      .filter(event => 
        event.severity === 'high' || event.severity === 'critical' &&
        event.timestamp > new Date(Date.now() - 24 * 60 * 60 * 1000)
      )
      .slice(0, 10);

    const recommendations: string[] = [];

    if (stats.blockedIPs > 10) {
      recommendations.push('High number of blocked IPs detected. Consider implementing geographic restrictions.');
    }

    if (stats.eventsByType.injection_attempt > 5) {
      recommendations.push('Multiple injection attempts detected. Review input validation rules.');
    }

    if (stats.eventsByType.rate_limit_exceeded > 100) {
      recommendations.push('High rate limiting activity. Consider adjusting rate limits or implementing CAPTCHA.');
    }

    const summary = `Security monitoring active. ${stats.totalEvents} total events, ${stats.blockedIPs} blocked IPs, ${recentThreats.length} recent high-severity threats.`;

    return {
      summary,
      stats,
      recentThreats,
      recommendations
    };
  }
}

export const securityService = new SecurityService();