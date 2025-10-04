import { randomUUID } from 'crypto';

export interface AuditLogEntry {
  id: string;
  action: string;
  route: string;
  userId: string | null;
  organizationId: string | null;
  timestamp: Date;
  metadata?: Record<string, unknown> | null;
}

interface RecordAuditEventOptions {
  action: string;
  route: string;
  userId?: string | null;
  organizationId?: string | null;
  metadata?: Record<string, unknown> | null;
}

class AuditLogService {
  private entries: AuditLogEntry[] = [];
  private readonly maxEntries = 1000;

  record(event: RecordAuditEventOptions): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: randomUUID(),
      action: event.action,
      route: event.route,
      userId: event.userId ?? null,
      organizationId: event.organizationId ?? null,
      timestamp: new Date(),
      metadata: event.metadata ?? null,
    };

    this.entries.unshift(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.length = this.maxEntries;
    }

    return entry;
  }

  list(): AuditLogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries.length = 0;
  }
}

export const auditLogService = new AuditLogService();
