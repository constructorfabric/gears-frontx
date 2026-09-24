# Shared style modules

Each module in `src/styles/modules/` holds CSS that two or more components compose with `composes:`. Add a rule here only when a second component needs it.

- `.srOnly` — visually hides assistive text without removing it from the accessibility tree; agenda-view, day-grid, event-card, month-grid, search-results, and week-grid.
- `.unavailable` — unavailable event and cell foreground, surface, and cursor state; agenda-view, availability-grid, day-grid, event-card, and week-grid (border colour remains local).
- `.selectedRing` — outlined selected-event state; agenda-view, event-card, and week-grid.
- `.segmentStart` — removes the trailing corners from a segmented event; agenda-view and event-card.
- `.segmentMiddle` — removes all corners from a segmented event; agenda-view and event-card.
- `.segmentEnd` — removes the leading corners from a segmented event; agenda-view and event-card.
- `.focusRing` — standard visible keyboard-focus outline; calendar-grid, agenda-view, event-card, search-results, time-zone-list, and world-clocks.
- `.focusRingInset` — visible keyboard-focus outline kept inside a clipped cell; calendar-grid, month-grid, availability-grid, and month-navigator.
- `.nowLine` — non-interactive current-time rule; day-grid and week-grid.
- `.nowLabel` — current-time label beside the gutter; day-grid and week-grid.
- `.metaText` — muted metadata typography; agenda-view, day-grid, event-card, month-navigator, search-results, and week-grid.
- `.dayNumber` — calendar day-number typography; agenda-view, day-grid, month-grid, and week-grid.
- `.weekdayLabel` — truncated uppercase weekday-label typography; agenda-view, day-grid, search-results, and week-grid.
- `.sectionLabel` — uppercase metadata heading typography; event-detail-panel.
- `.title` — calendar title typography; calendar-toolbar, event-detail-panel, and month-navigator.
- `.truncate` — single-line ellipsis treatment; conflict-indicator and event-card.
- `.ellipsis` — width-bounded ellipsis treatment; agenda-view and search-results.
- `.headerCell` — shared grid-column heading geometry and metadata typography; grid and month-grid.
- `.gutterCell` — shared single-line time-gutter label treatment; agenda-view, day-grid, and week-grid.
- `.listReset` — semantic list reset; agenda-view, conflict-indicator, event-detail-panel, and world-clocks.
- `.panelRoot` — compact vertical panel stack; time-zone-list and world-clocks.
- `.panelHeading` — compact panel-heading typography; time-zone-list and world-clocks; world-clocks keeps a `:global(svg)` icon selector in its consumer stylesheet.
- `.helperText` — muted meta-size helper copy with no margin; create-event, alert-dialog, dialog, field, combobox.
- `.fieldIcon` — 16px leading icon slot of a field; input, combobox, select.
- `.topLabel` — label row above a field; input and textarea.
- `.gridGeometry` — hour-row height, gutter width, and chip height shared by the time grids; day-grid, week-grid, month-grid, agenda-view, availability-grid.
- `.dialogTitle` — dialog and alert-dialog title typography; dialog, alert-dialog.
- `.field` — vertical label/control/message stack; input, field, textarea.
- `.chevron` — field disclosure chevron; select, combobox.
- `.actionRow` — right-aligned row of header actions; subheader, event-detail-panel.
- `.iconBox` — centred 16px icon slot; list, subheader, `.fieldIcon`.
- `.viewRoot` — full-height flex column that roots a calendar view; week-grid, agenda-view.
- `.expandedDialog` — footprint of an expanded popover dialog; create-event, event-detail-panel.
