export interface RunSummary {
  executionId: string;
  workflowId: string;
  workflowName: string;
  organizationId: string | null;
  status: string;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  triggerType?: string;
  totalNodes?: number;
  completedNodes?: number;
  failedNodes?: number;
  tags: string[];
  correlationId: string | null;
  requestId: string | null;
  connectors: string[];
  duplicateEvents: Array<{
    id: string;
    webhookId: string;
    timestamp: string;
    error: string;
  }>;
  metadata: Record<string, unknown>;
}

export interface RunFacetEntry {
  value: string;
  count: number;
}

export interface RunSearchResult {
  success: boolean;
  runs: RunSummary[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  };
  facets: {
    status: RunFacetEntry[];
    connector: RunFacetEntry[];
  };
}

export interface RunSearchParams {
  organizationId?: string;
  workflowId?: string;
  statuses?: string[];
  connectors?: string[];
  page?: number;
  pageSize?: number;
}

function appendArrayParam(params: URLSearchParams, key: string, values?: string[]) {
  if (!values || values.length === 0) {
    return;
  }
  values.forEach((value) => {
    if (value) {
      params.append(key, value);
    }
  });
}

export async function searchRuns(params: RunSearchParams): Promise<RunSearchResult> {
  const query = new URLSearchParams();

  if (params.organizationId) {
    query.set('organizationId', params.organizationId);
  }
  if (params.workflowId) {
    query.set('workflowId', params.workflowId);
  }
  appendArrayParam(query, 'status', params.statuses);
  appendArrayParam(query, 'connectorId', params.connectors);

  if (params.page && params.page > 0) {
    query.set('page', String(params.page));
  }
  if (params.pageSize && params.pageSize > 0) {
    query.set('pageSize', String(params.pageSize));
  }

  const response = await fetch(`/api/runs/search?${query.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to load runs (status ${response.status})`);
  }
  const data = (await response.json()) as RunSearchResult;
  return data;
}
