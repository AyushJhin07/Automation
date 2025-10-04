export interface NormalizedList {
  items: any[];
  meta?: any;
}

export function normalizeListResponse(appId: string, data: any): NormalizedList | undefined {
  if (!data) return undefined;
  // Slack list patterns
  if (appId === 'slack') {
    if (Array.isArray(data.members)) return { items: data.members, meta: data.response_metadata };
    if (Array.isArray(data.channels)) return { items: data.channels, meta: data.response_metadata };
    if (Array.isArray(data.files)) return { items: data.files, meta: data.paging };
  }
  // Stripe style
  if (appId === 'stripe') {
    if (Array.isArray(data.data)) return { items: data.data, meta: { has_more: data.has_more } };
  }
  // HubSpot
  if (appId === 'hubspot') {
    if (Array.isArray(data.results)) return { items: data.results, meta: data.paging };
  }
  // Microsoft Dynamics 365 (Dataverse)
  if (appId === 'dynamics365') {
    if (Array.isArray((data || {}).value)) {
      const meta: Record<string, any> = {};
      const nextLink = data['@odata.nextLink'];
      if (typeof nextLink === 'string') {
        meta.nextLink = nextLink;
        const skipToken = extractSkipToken(nextLink);
        if (skipToken) {
          meta.nextCursor = skipToken;
        }
      }
      if (typeof data['@odata.count'] === 'number') {
        meta.count = data['@odata.count'];
      }
      if (typeof data['@odata.deltaLink'] === 'string') {
        meta.deltaLink = data['@odata.deltaLink'];
      }
      if (typeof data['@odata.context'] === 'string') {
        meta.context = data['@odata.context'];
      }

      return { items: data.value, meta: Object.keys(meta).length ? meta : undefined };
    }
  }
  // GitHub common lists
  if (appId === 'github') {
    if (Array.isArray(data)) return { items: data };
  }
  // Zendesk
  if (appId === 'zendesk') {
    if (Array.isArray((data || {}).results)) return { items: data.results, meta: { next_page: data.next_page } };
    if (Array.isArray((data || {}).tickets)) return { items: data.tickets, meta: { next_page: data.next_page } };
    if (Array.isArray((data || {}).users)) return { items: data.users, meta: { next_page: data.next_page } };
  }
  // Typeform
  if (appId === 'typeform') {
    if (Array.isArray((data || {}).items)) return { items: data.items, meta: { total: data.total_items } };
  }
  // Google Drive
  if (appId === 'google-drive') {
    if (Array.isArray((data || {}).files)) return { items: data.files, meta: { nextPageToken: data.nextPageToken } };
  }
  // Google Calendar
  if (appId === 'google-calendar') {
    if (Array.isArray((data || {}).items)) return { items: data.items, meta: { nextPageToken: data.nextPageToken } };
  }
  // Dropbox
  if (appId === 'dropbox') {
    if (Array.isArray((data || {}).matches)) return { items: data.matches, meta: data };
    if (Array.isArray((data || {}).entries)) return { items: data.entries, meta: { has_more: data.has_more, cursor: data.cursor } };
  }
  // Generic patterns
  if (Array.isArray(data.items)) return { items: data.items, meta: data.meta };
  if (Array.isArray(data.results)) return { items: data.results, meta: data.meta };
  if (Array.isArray(data.data)) return { items: data.data, meta: data.meta };
  if (Array.isArray(data)) return { items: data };
  return undefined;
}

function extractSkipToken(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('$skiptoken') ?? parsed.searchParams.get('$skipToken') ?? undefined;
  } catch {
    const match = url.match(/[$]skiptoken=([^&]+)/i);
    return match ? decodeURIComponent(match[1]) : undefined;
  }
}

