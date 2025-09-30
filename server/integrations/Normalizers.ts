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

