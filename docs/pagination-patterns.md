# Pagination Patterns by Vendor

- Slack: response_metadata.next_cursor → pass as `cursor` or `page_token`.
- Stripe: has_more boolean + use last item's id as `starting_after`; list params include `limit`, `starting_after`.
- HubSpot: paging.next.after token → use `after` param for next page; many CRM endpoints use `limit` and `after`.
- GitHub: Link headers; JSON endpoints commonly use `per_page` and `page`.
- Typeform: `page_size` and cursors; responses include total and items.
- Zendesk: `next_page` URL in response; include pagination params accordingly.
