# Guideline: What the Inbox App Is, and What It Is Not

This template ships a working helpdesk application. Three screens are complete
and nothing about them is a placeholder. The list below exists so that a
screen added later stays inside the same product, and so that no one rebuilds
something that was deliberately left out.

## In scope, and already shipped

- **Chat screen.** Channel sidebar with "General", "Support" and "Sales" and
  their counts; a conversation list with live search, an open-conversation
  counter and four sort orders; the message thread with its attachment chip,
  read receipts and internal notes; the reply-and-note composer; the
  customer-details panel with its Details and Copilot tabs; the "Select a
  conversation" empty state.
- **The thread's inert chrome.** The create-ticket button and the overflow menu
  in the thread header, and the attach, emoji and saved-replies buttons on the
  composer, are drawn and reachable. They carry no handler, because each would
  need a section or a store this template does not ship. They are shipped, not
  missing: adding one means giving it a behaviour, not adding the control.
- **Suggested replies.** Each conversation carries its own `suggestedReplies`,
  rendered as chips between the transcript and the composer. Clicking one
  drafts it into the reply box. A thread with an empty list - every spam thread
  and every snoozed one - renders no chip row at all.
- **Contacts screen.** Five filters with their counts, a sortable table paged
  25 rows at a time, and the contact detail view with its qualification
  checklist, tickets, conversations and activity timeline.
- **Mail screen.** A mailbox sidebar - Compose, then Inbox, Drafts, Sent,
  Archive and Trash with their counts; a mail list with "All mail"/"Unread
  (N)" tabs and live search over the sender and the subject; a reading pane
  that renders a mail flat, with no chat bubbles - the newest message full
  width, any earlier ones behind an "N earlier messages" toggle as muted
  cards - and a reply composer with the same send-gating as the chat
  composer's. Read/unread is typography only (weight and opacity), never a
  dot, and a starred mail shows a small filled star on its row.
- **The mail toolbar's inert chrome.** Archive, move-to-trash, star and reply
  in the reading pane's toolbar, and the Compose button above the mailbox
  list, are drawn and reachable but carry no handler - the same dead-controls
  convention as the chat thread's create-ticket button and composer
  attachments (see above). They are shipped, not missing.
- **The chrome around all three.** The icon rail: the product mark, a button
  per section with its active state, and at the bottom the theme toggle and
  the profile menu.
- **The jump between screens.** "View contact" in a thread opens that
  person's page at `#/contacts/{id}` - a real address, not screen state.

## Not to build

Every item here exists in the product this workspace is modelled on. None of it
is missing by accident, and none of it should be added while carrying out an
unrelated request.

- **Other sections.** Tickets, Knowledge Base, AI Agent and Reports. The ticket
  rows on a contact's detail page are labels, not links into a Tickets section,
  and the thread header's create-ticket button opens nothing for the same
  reason.
- **Other channels and views.** Mentions, Created by you, All, Unassigned,
  Starred, High priority, Snoozed, and the team inboxes. A conversation can be
  routed to a team inbox from the details panel; adding, renaming or removing
  channels themselves is out of scope.
- **The new-conversation flow.** The compose trigger and its modal.
- **A Spam mailbox, and labels.** The mail screen ships five mailboxes, not
  six - Spam is deliberately absent from this product. Labels (colour-dot
  tags on a mail) are not shipped either; do not add either while carrying out
  an unrelated request.
- **Sending mail for real, and the new-mail flow.** The mail composer's Send
  button clears the draft rather than posting anywhere, and the Compose
  button in the mailbox sidebar is inert, exactly as the create-conversation
  flow above is absent from chat.
- **The command palette**, the messenger settings, the settings screen and the
  theme customiser - all four are rail controls in the reference and none is
  here. The app ships a plain two-state theme toggle and nothing else that
  changes appearance.
- **Copilot's behaviour.** The tab renders its prompts and its input; wiring
  them to a model is a project's own decision and its own backend.
- **The behaviour behind the composer's three buttons**: an upload target for
  the paperclip, a picker for the emoji button, a canned-reply library for
  saved replies. The buttons themselves ship (see above). The transcript
  renders an attachment that arrived with a message; nothing sends one.
- **Authentication.** Profile, Settings and Log out in the profile menu are
  inert, as they are in the reference. There is no sign-in screen and no
  session.

## When a request asks for one of these

Say which item it is and what it would take, then let the project decide. Do
not fold a whole section into a screen that was asked for something smaller,
and do not leave a half-built version of one behind.
