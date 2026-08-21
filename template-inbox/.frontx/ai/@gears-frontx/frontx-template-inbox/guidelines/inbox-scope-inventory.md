# Guideline: What the Inbox Workspace Is, and What It Is Not

This template ships a working helpdesk workspace. Two screens are complete and
nothing about them is a placeholder. The list below exists so that a screen
added later stays inside the same product, and so that no one rebuilds
something that was deliberately left out.

## In scope, and already shipped

- **Inbox screen.** Folder sidebar with "Your inbox" and "Spam" and their
  counts; a conversation list with live search, an open-conversation counter
  and four sort orders; the message thread with its attachment chip, read
  receipts and internal notes; the reply-and-note composer; the
  customer-details panel with its Details and Copilot tabs; the "Select a
  conversation" empty state; the theme toggle and the user menu.
- **Contacts screen.** Five filters with their counts, a sortable table paged
  25 rows at a time, and the contact detail view with its qualification
  checklist, tickets, conversations and activity timeline.
- **The jump between them.** "View contact" in a thread opens that person's
  detail page on the contacts screen.

## Not to build

Every item here exists in the product this workspace is modelled on. None of it
is missing by accident, and none of it should be added while carrying out an
unrelated request.

- **Other sections.** Tickets, Knowledge Base, AI Agent and Reports. The ticket
  rows on a contact's detail page are labels, not links into a Tickets section.
- **Other inbox folders and views.** Mentions, Created by you, All, Unassigned,
  Starred, High priority, Snoozed, and the team inboxes. A conversation can be
  routed to a team inbox from the details panel; the folders themselves are out
  of scope.
- **The new-conversation flow.** The compose trigger and its modal.
- **The command palette**, the messenger settings, the settings screen and the
  theme customiser. The workspace ships a plain two-state theme toggle and
  nothing else that changes appearance.
- **Copilot's behaviour.** The tab renders its prompts and its input; wiring
  them to a model is a project's own decision and its own backend.
- **Saved replies, emoji picker and file attachment** on the composer. The
  transcript renders an attachment that arrived with a message; nothing sends
  one.
- **Authentication.** Profile, Settings and Log out in the user menu are inert,
  as they are in the reference.

## When a request asks for one of these

Say which item it is and what it would take, then let the project decide. Do
not fold a whole section into a screen that was asked for something smaller,
and do not leave a half-built version of one behind.
