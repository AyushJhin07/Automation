import { AirtableAPIClient } from './AirtableAPIClient';
import { GmailAPIClient } from './GmailAPIClient';
import { NotionAPIClient } from './NotionAPIClient';
import { ShopifyAPIClient } from './ShopifyAPIClient';
import { SlackAPIClient } from './SlackAPIClient';
import { GenericAPIClient } from './GenericAPIClient';
import { DropboxAPIClient } from './DropboxAPIClient';
import { GithubAPIClient } from './GithubAPIClient';
import { GoogleCalendarAPIClient } from './GoogleCalendarAPIClient';
import { GoogleDriveAPIClient } from './GoogleDriveAPIClient';
import { HubspotAPIClient } from './HubspotAPIClient';
import { StripeAPIClient } from './StripeAPIClient';
import { TrelloAPIClient } from './TrelloAPIClient';
import { ZendeskAPIClient } from './ZendeskAPIClient';
import { MailchimpAPIClient } from './MailchimpAPIClient';
import { TwilioAPIClient } from './TwilioAPIClient';

export const IMPLEMENTED_CONNECTOR_CLIENTS = {
  airtable: AirtableAPIClient,
  gmail: GmailAPIClient,
  notion: NotionAPIClient,
  shopify: ShopifyAPIClient,
  slack: SlackAPIClient,
  dropbox: DropboxAPIClient,
  github: GithubAPIClient,
  'google-calendar': GoogleCalendarAPIClient,
  'google-drive': GoogleDriveAPIClient,
  hubspot: HubspotAPIClient,
  stripe: StripeAPIClient,
  trello: TrelloAPIClient,
  zendesk: ZendeskAPIClient,
  mailchimp: MailchimpAPIClient,
  twilio: TwilioAPIClient,
  'asana-enhanced': GenericAPIClient
} as const;

export type ImplementedConnectorId = keyof typeof IMPLEMENTED_CONNECTOR_CLIENTS;
