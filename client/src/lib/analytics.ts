import { normalizeConnectorId } from '@/services/connectorDefinitionsService';
import { normalizeRuntimeOperationId } from '@/services/runtimeCapabilitiesService';

export type AnalyticsEventProperties = Record<string, string | number | boolean | null | undefined>;

type AnalyticsClient = {
  track?: (event: string, properties?: AnalyticsEventProperties) => void;
  capture?: (event: string, properties?: AnalyticsEventProperties) => void;
  logEvent?: (event: string, properties?: AnalyticsEventProperties) => void;
  publish?: (event: string, properties?: AnalyticsEventProperties) => void;
};

type PlausibleFn = (event: string, options?: { props?: AnalyticsEventProperties }) => void;

type GtagFn = (command: 'event', event: string, params?: AnalyticsEventProperties) => void;

type DataLayer = Array<Record<string, unknown>>;

declare global {
  interface Window {
    analytics?: AnalyticsClient;
    plausible?: PlausibleFn;
    gtag?: GtagFn;
    dataLayer?: DataLayer;
  }
}

const cleanProperties = (
  properties: AnalyticsEventProperties | undefined,
): AnalyticsEventProperties | undefined => {
  if (!properties) {
    return undefined;
  }

  const cleaned: AnalyticsEventProperties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }

  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
};

const dispatchWithKnownClients = (
  event: string,
  properties: AnalyticsEventProperties | undefined,
): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  const { analytics, plausible, gtag, dataLayer } = window;

  try {
    if (analytics) {
      if (typeof analytics.track === 'function') {
        analytics.track(event, properties);
        return true;
      }
      if (typeof analytics.capture === 'function') {
        analytics.capture(event, properties);
        return true;
      }
      if (typeof analytics.logEvent === 'function') {
        analytics.logEvent(event, properties);
        return true;
      }
      if (typeof analytics.publish === 'function') {
        analytics.publish(event, properties);
        return true;
      }
    }

    if (typeof plausible === 'function') {
      plausible(event, properties ? { props: properties } : undefined);
      return true;
    }

    if (typeof gtag === 'function') {
      gtag('event', event, properties);
      return true;
    }

    if (Array.isArray(dataLayer)) {
      dataLayer.push({ event, ...(properties ?? {}) });
      return true;
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to dispatch analytics event', { event, error });
    }
    return false;
  }

  return false;
};

export const trackAnalyticsEvent = (
  event: string,
  properties?: AnalyticsEventProperties,
): void => {
  if (!event || typeof event !== 'string') {
    return;
  }

  const cleaned = cleanProperties(properties);
  const handled = dispatchWithKnownClients(event, cleaned);

  if (!handled && process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.debug('[analytics]', event, cleaned ?? {});
  }
};

export const sanitizeAnalyticsConnectorId = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = normalizeConnectorId(value);
  return normalized || undefined;
};

export const sanitizeAnalyticsOperationId = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = normalizeRuntimeOperationId(value);
  if (!normalized) {
    return undefined;
  }

  const sanitized = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return sanitized || undefined;
};
