# Bronze Coverage Audit

## slack
- Missing endpoint/method: 3
  - trigger.message_received (Message Received)
  - trigger.reaction_added (Reaction Added)
  - trigger.user_joined_channel (User Joined Channel)

## hubspot
- Missing endpoint/method: 4
  - trigger.contact_created (Contact Created)
  - trigger.contact_updated (Contact Updated)
  - trigger.deal_created (Deal Created)
  - trigger.deal_stage_changed (Deal Stage Changed)

## stripe
- Missing endpoint/method: 9
  - action.create_subscription (Create Subscription)
  - action.create_refund (Create Refund)
  - action.retrieve_customer (Retrieve Customer)
  - action.list_payment_intents (List Payment Intents)
  - action.update_subscription (Update Subscription)
  - trigger.payment_succeeded (Payment Succeeded)
  - trigger.payment_failed (Payment Failed)
  - trigger.subscription_created (Subscription Created)
  - trigger.invoice_payment_succeeded (Invoice Payment Succeeded)

## typeform
- Missing endpoint/method: 4
  - action.create_form (Create Form)
  - action.get_form (Get Form)
  - trigger.form_response (Form Response)
  - trigger.form_created (Form Created)

## trello
- Missing endpoint/method: 15
  - action.create_board (Create Board)
  - action.update_board (Update Board)
  - action.create_list (Create List)
  - action.get_list (Get List)
  - action.update_list (Update List)
  - action.create_card (Create Card)
  - action.get_card (Get Card)
  - action.update_card (Update Card)
  - action.add_comment_to_card (Add Comment to Card)
  - action.create_checklist (Create Checklist)
  - action.add_checklist_item (Add Checklist Item)
  - trigger.card_created (Card Created)
  - trigger.card_updated (Card Updated)
  - trigger.card_moved (Card Moved)
  - trigger.list_created (List Created)

## zendesk
- Missing endpoint/method: 8
  - action.search_tickets (Search Tickets)
  - action.create_user (Create User)
  - action.get_user (Get User)
  - action.update_user (Update User)
  - action.list_users (List Users)
  - trigger.ticket_created (Ticket Created)
  - trigger.ticket_updated (Ticket Updated)
  - trigger.user_created (User Created)

## github
- Missing endpoint/method: 7
  - action.create_comment (Create Comment)
  - action.get_repository (Get Repository)
  - trigger.issue_opened (Issue Opened)
  - trigger.pull_request_opened (Pull Request Opened)
  - trigger.push (Push)
  - trigger.issue_closed (Issue Closed)
  - trigger.pull_request_merged (Pull Request Merged)
