import { AirtableAPIClient } from './AirtableAPIClient';
import { GmailAPIClient } from './GmailAPIClient';
import { NotionAPIClient } from './NotionAPIClient';
import { ShopifyAPIClient } from './ShopifyAPIClient';
import { SlackAPIClient } from './SlackAPIClient';
import { GenericAPIClient } from './GenericAPIClient';

export const IMPLEMENTED_CONNECTOR_CLIENTS = {
  airtable: AirtableAPIClient,
  gmail: GmailAPIClient,
  notion: NotionAPIClient,
  shopify: ShopifyAPIClient,
  slack: SlackAPIClient,
  'asana-enhanced': GenericAPIClient,
  mailchimp: GenericAPIClient,
  twilio: GenericAPIClient
} as const;

export type ImplementedConnectorId = keyof typeof IMPLEMENTED_CONNECTOR_CLIENTS;
