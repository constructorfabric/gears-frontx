/**
 * The action type ids this workspace dispatches over the actions chain.
 *
 * The two `chrome.*` ids are the host's contract, declared on the shell's
 * screen domain (`template-shell/src-app/app/mfe/chrome-actions.ts`) and
 * answered by handlers there; the literals must match that file exactly. The
 * `open_contact` id is this package's own, declared in `mfe.json` and answered
 * by the contacts lifecycle.
 */

export const CHROME_SET_THEME =
  'gts.frontx.mfes.comm.action.v1~frontx.screensets.chrome.set_theme.v1~';

export const CHROME_SET_MENU_COLLAPSED =
  'gts.frontx.mfes.comm.action.v1~frontx.screensets.chrome.set_menu_collapsed.v1~';

export const INBOX_OPEN_CONTACT =
  'gts.frontx.mfes.comm.action.v1~frontx.inbox.action.open_contact.v1~';
