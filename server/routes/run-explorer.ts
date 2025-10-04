import { Router } from 'express';
import { and, eq, inArray, or, sql, desc, asc, type SQL } from 'drizzle-orm';

import { db, executionLogs, nodeLogs, workflows } from '../database/schema.js';
import { triggerPersistenceService } from '../services/TriggerPersistenceService.js';
import { getErrorMessage } from '../types/common.js';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

const runsRouter = Router();

function normalizeArrayParam(value: unknown): string[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return undefined;
}

function combineConditions(conditions: Array<SQL<unknown> | undefined>): SQL<unknown> | undefined {
  const filtered = conditions.filter((condition): condition is SQL<unknown> => Boolean(condition));
  if (filtered.length === 0) return undefined;
  if (filtered.length === 1) return filtered[0];
  return and(...filtered);
}

runsRouter.get('/search', async (req, res) => {
  if (!db) {
    return res.status(503).json({ success: false, error: 'Database not configured' });
  }

  try {
    const organizationId = req.query.organizationId ? String(req.query.organizationId) : undefined;
    const workflowIds = normalizeArrayParam(req.query.workflowId ?? req.query.workflowIds);
    const statusFilters = normalizeArrayParam(req.query.status ?? req.query.statuses);
    const connectorFilters = normalizeArrayParam(req.query.connectorId ?? req.query.connectorIds)?.map((value) =>
      value.toLowerCase()
    );

    const page = req.query.page ? Math.max(1, parseInt(String(req.query.page), 10) || 1) : 1;
    const pageSizeRaw = req.query.pageSize ?? req.query.limit;
    const pageSize = pageSizeRaw ? Math.max(1, Math.min(MAX_PAGE_SIZE, parseInt(String(pageSizeRaw), 10) || DEFAULT_PAGE_SIZE)) : DEFAULT_PAGE_SIZE;
    const offset = (page - 1) * pageSize;

    const baseConditions: SQL<unknown>[] = [];

    if (organizationId) {
      baseConditions.push(eq(workflows.organizationId, organizationId));
    }

    if (workflowIds && workflowIds.length > 0) {
      baseConditions.push(inArray(executionLogs.workflowId, workflowIds));
    }

    if (connectorFilters && connectorFilters.length > 0) {
      const connectorClauses = connectorFilters.map((connector) =>
        sql`EXISTS (
          SELECT 1 FROM ${nodeLogs} nl
          WHERE nl.execution_id = ${executionLogs.executionId}
            AND (
              lower(nl.metadata ->> 'connectorId') = ${connector}
              OR lower(split_part(nl.node_type, '.', 2)) = ${connector}
            )
        )`
      );

      if (connectorClauses.length === 1) {
        baseConditions.push(connectorClauses[0]);
      } else if (connectorClauses.length > 1) {
        baseConditions.push(or(...connectorClauses));
      }
    }

    const statusCondition = statusFilters && statusFilters.length > 0 ? inArray(executionLogs.status, statusFilters) : undefined;

    const whereClause = combineConditions([...baseConditions, statusCondition]);
    const facetWhereClause = combineConditions(baseConditions);

    const runs = await db
      .select({
        execution: executionLogs,
        workflow: workflows,
      })
      .from(executionLogs)
      .leftJoin(workflows, eq(workflows.id, executionLogs.workflowId))
      .where(whereClause)
      .orderBy(desc(executionLogs.startTime))
      .limit(pageSize)
      .offset(offset);

    const [{ value: total = 0 } = { value: 0 }] = await db
      .select({ value: sql<number>`count(*)` })
      .from(executionLogs)
      .leftJoin(workflows, eq(workflows.id, executionLogs.workflowId))
      .where(whereClause ?? undefined)
      .limit(1);

    const executionIds = runs.map((row) => row.execution.executionId).filter(Boolean);

    const nodeRows = executionIds.length
      ? await db
          .select({
            executionId: nodeLogs.executionId,
            nodeType: nodeLogs.nodeType,
            metadata: nodeLogs.metadata,
            status: nodeLogs.status,
            startTime: nodeLogs.startTime,
          })
          .from(nodeLogs)
          .where(inArray(nodeLogs.executionId, executionIds))
      : [];

    const connectorsByExecution = new Map<string, Set<string>>();
    nodeRows.forEach((row) => {
      const connectors = connectorsByExecution.get(row.executionId) ?? new Set<string>();
      const metadata = (row.metadata ?? {}) as Record<string, any>;
      const rawMetadataConnector = typeof metadata.connectorId === 'string' ? metadata.connectorId : undefined;
      const normalizedMetadataConnector = rawMetadataConnector?.trim() ?? '';

      if (normalizedMetadataConnector) {
        connectors.add(normalizedMetadataConnector);
      }

      if (typeof row.nodeType === 'string') {
        const parts = row.nodeType.split('.');
        if (parts.length >= 2 && (parts[0] === 'action' || parts[0] === 'trigger')) {
          connectors.add(parts[1]);
        }
      }

      connectorsByExecution.set(row.executionId, connectors);
    });

    const uniqueWorkflowIds = Array.from(new Set(runs.map((row) => row.execution.workflowId).filter(Boolean)));
    const duplicateEventsByWorkflow = new Map<string, Array<{ id: string; webhookId: string; timestamp: Date; error: string }>>();

    await Promise.all(
      uniqueWorkflowIds.map(async (workflowId) => {
        try {
          const events = await triggerPersistenceService.listDuplicateWebhookEvents({ workflowId, limit: 5 });
          duplicateEventsByWorkflow.set(workflowId, events);
        } catch (error) {
          console.error('Failed to load duplicate webhook events for workflow', workflowId, error);
          duplicateEventsByWorkflow.set(workflowId, []);
        }
      })
    );

    const items = runs.map((row) => {
      const execution = row.execution;
      const workflow = row.workflow;
      const metadata = (execution.metadata && typeof execution.metadata === 'object') ? execution.metadata as Record<string, any> : {};
      const connectors = Array.from(connectorsByExecution.get(execution.executionId) ?? []);
      const duplicateEvents = duplicateEventsByWorkflow.get(execution.workflowId) ?? [];

      return {
        executionId: execution.executionId,
        workflowId: execution.workflowId,
        workflowName: execution.workflowName ?? workflow?.name ?? execution.workflowId,
        organizationId: workflow?.organizationId ?? null,
        status: execution.status,
        startTime: execution.startTime,
        endTime: execution.endTime,
        durationMs: execution.durationMs,
        triggerType: execution.triggerType,
        totalNodes: execution.totalNodes,
        completedNodes: execution.completedNodes,
        failedNodes: execution.failedNodes,
        tags: execution.tags ?? [],
        correlationId: execution.correlationId ?? null,
        requestId: typeof metadata.requestId === 'string' ? metadata.requestId : null,
        connectors,
        duplicateEvents: duplicateEvents.map((event) => ({
          id: event.id,
          webhookId: event.webhookId,
          timestamp: event.timestamp,
          error: event.error,
        })),
        metadata,
      };
    });

    const statusFacetRows = await db
      .select({
        status: executionLogs.status,
        count: sql<number>`count(*)`,
      })
      .from(executionLogs)
      .leftJoin(workflows, eq(workflows.id, executionLogs.workflowId))
      .where(facetWhereClause ?? undefined)
      .groupBy(executionLogs.status)
      .orderBy(asc(executionLogs.status));

    const connectorFacetRows = await db
      .select({
        connector: sql<string>`LOWER(NULLIF(COALESCE(${nodeLogs.metadata} ->> 'connectorId', split_part(${nodeLogs.nodeType}, '.', 2)), ''))`,
        count: sql<number>`COUNT(DISTINCT ${nodeLogs.executionId})`,
      })
      .from(nodeLogs)
      .innerJoin(executionLogs, eq(nodeLogs.executionId, executionLogs.executionId))
      .leftJoin(workflows, eq(workflows.id, executionLogs.workflowId))
      .where(
        combineConditions([
          facetWhereClause ?? undefined,
          sql`COALESCE(${nodeLogs.metadata} ->> 'connectorId', split_part(${nodeLogs.nodeType}, '.', 2)) IS NOT NULL`,
        ]) ?? undefined
      )
      .groupBy(sql`LOWER(NULLIF(COALESCE(${nodeLogs.metadata} ->> 'connectorId', split_part(${nodeLogs.nodeType}, '.', 2)), ''))`)
      .orderBy(desc(sql`COUNT(DISTINCT ${nodeLogs.executionId})`))
      .limit(25);

    const facets = {
      status: statusFacetRows
        .map((row) => ({
          value: row.status,
          count: Number(row.count ?? 0),
        }))
        .filter((entry) => entry.value),
      connector: connectorFacetRows
        .map((row) => ({
          value: row.connector ?? '',
          count: Number(row.count ?? 0),
        }))
        .filter((entry) => entry.value),
    };

    res.json({
      success: true,
      runs: items,
      pagination: {
        total,
        page,
        pageSize,
        hasMore: offset + pageSize < total,
      },
      facets,
    });
  } catch (error) {
    console.error('Failed to search runs', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

export default runsRouter;
