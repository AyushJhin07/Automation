import { WorkflowGraph, WorkflowNode, WorkflowEdge } from '../../common/workflow-types';

export function answersToGraph(prompt: string, answers: Record<string, string>): WorkflowGraph {
  // ---- Parse user answers ----
  const trigger = (answers.trigger || 'On a time based schedule').toLowerCase();
  const filter  = answers.filter || '';
  const fields  = (answers.fields || '').toLowerCase();
  const dest    = answers.destination || '';
  const freqTxt = answers.frequency || '';

  const keywords = extractQuoted(filter);             // e.g., ["Flipkart"]
  const { spreadsheetId, sheetName } = parseSheet(dest);
  const everyMin = parseFrequency(freqTxt);           // default 5

  // ---- Build nodes ----
  const nodes: WorkflowNode[] = [
    {
      id: 'n1',
      type: 'trigger',
      app: 'gmail',
      name: 'Gmail Trigger',
      op: trigger.includes('time') ? 'gmail.timeBased' : 'gmail.newMail',
      params: {
        query: buildQuery(keywords),
        everyMinutes: everyMin,
      },
    },
    {
      id: 'n2',
      type: 'transform',
      app: 'gmail',
      name: 'Filter by Subject',
      op: 'gmail.filterSubjectContains',
      params: { keywords },
    },
    {
      id: 'n3',
      type: 'transform',
      app: 'core',
      name: 'Pick Fields',
      op: 'core.pickFields',
      params: {
        subject: true,
        from: true,
        body: fields.includes('body'),
        date: true,
      },
    },
    {
      id: 'n4',
      type: 'action',
      app: 'sheets',
      name: 'Append to Sheet',
      op: 'sheets.appendRow',
      params: { spreadsheetId, sheetName },
    },
  ];

  const edges: WorkflowEdge[] = [
    { id: 'e1', from: 'n1', to: 'n2' },
    { id: 'e2', from: 'n2', to: 'n3' },
    { id: 'e3', from: 'n3', to: 'n4' },
  ];

  return {
    id: `wf-${Date.now()}`,
    nodes,
    edges,
    meta: { prompt, answers, keywords, spreadsheetId, sheetName, everyMin },
  };
}

function extractQuoted(s: string): string[] {
  const m = s.match(/"([^"]+)"/g);
  return m ? m.map(x => x.replace(/"/g, '').trim()).filter(Boolean) : [];
}

function buildQuery(keywords: string[]): string {
  if (!keywords.length) return 'in:inbox is:unread';
  const or = keywords.map(k => `"${k}"`).join(' OR ');
  return `in:inbox is:unread subject:(${or})`;
}

export function parseSheet(s: string): { spreadsheetId: string; sheetName: string } {
  const id = (s.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/) || [])[1] || '';
  const sheet = ((s.split(',').pop() || '').trim()) || 'Sheet1';
  return { spreadsheetId: id, sheetName: sheet };
}

function parseFrequency(s: string): number {
  const m = s.match(/(\d+)\s*min/i);
  if (!m) return 5;
  return Math.max(1, Math.min(60, parseInt(m[1], 10)));
}