import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
  type AttachmentGroupProps,
} from './attachment';
import styles from './attachment.module.css';

afterEach(cleanup);

describe('Attachment', () => {
  it('renders a div with the base class and defaults to done/default/horizontal', () => {
    render(<Attachment data-testid="attachment" />);
    const attachment = screen.getByTestId('attachment');
    expect(attachment.tagName).toBe('DIV');
    expect(attachment.className).toContain(styles.attachment);
    expect(attachment.className).toContain(styles.sizeDefault);
    expect(attachment.className).toContain(styles.orientationHorizontal);
    expect(attachment.getAttribute('data-state')).toBe('done');
    expect(attachment.getAttribute('data-size')).toBe('default');
    expect(attachment.getAttribute('data-orientation')).toBe('horizontal');
  });

  it.each(['idle', 'uploading', 'processing', 'error', 'done'] as const)(
    'reflects state="%s" as a data attribute',
    (state) => {
      render(<Attachment data-testid="attachment" state={state} />);
      expect(screen.getByTestId('attachment').getAttribute('data-state')).toBe(state);
    },
  );

  it.each([
    ['default', styles.sizeDefault],
    ['sm', styles.sizeSm],
    ['xs', styles.sizeXs],
  ] as const)('applies the %s size class', (size, sizeClass) => {
    render(<Attachment data-testid="attachment" size={size} />);
    expect(screen.getByTestId('attachment').className).toContain(sizeClass);
  });

  it.each([
    ['horizontal', styles.orientationHorizontal],
    ['vertical', styles.orientationVertical],
  ] as const)('applies the %s orientation class', (orientation, orientationClass) => {
    render(<Attachment data-testid="attachment" orientation={orientation} />);
    expect(screen.getByTestId('attachment').className).toContain(orientationClass);
  });

  it('merges a consumer className without dropping the kit class', () => {
    render(<Attachment data-testid="attachment" className="consumer" />);
    const attachment = screen.getByTestId('attachment');
    expect(attachment.className).toContain(styles.attachment);
    expect(attachment.className).toContain('consumer');
  });
});

describe('AttachmentTitle shimmer', () => {
  it.each(['uploading', 'processing'] as const)(
    'adds the global shimmer class while state is %s, read from ancestor context',
    (state) => {
      render(
        <Attachment state={state}>
          <AttachmentContent>
            <AttachmentTitle data-testid="title">report.pdf</AttachmentTitle>
          </AttachmentContent>
        </Attachment>,
      );
      expect(screen.getByTestId('title').className).toContain('shimmer');
    },
  );

  it.each(['idle', 'error', 'done'] as const)('does not shimmer while state is %s', (state) => {
    render(
      <Attachment state={state}>
        <AttachmentContent>
          <AttachmentTitle data-testid="title">report.pdf</AttachmentTitle>
        </AttachmentContent>
      </Attachment>,
    );
    expect(screen.getByTestId('title').className).not.toContain('shimmer');
  });

  it('requires no state prop on AttachmentTitle itself, matching upstream', () => {
    render(
      <Attachment state="uploading">
        <AttachmentTitle data-testid="title">report.pdf</AttachmentTitle>
      </Attachment>,
    );
    // No `state` prop was passed to AttachmentTitle — it still shimmers via context.
    expect(screen.getByTestId('title').className).toContain('shimmer');
  });
});

describe('Attachment parts', () => {
  it('renders AttachmentMedia, AttachmentContent, AttachmentDescription, AttachmentActions with their own classes', () => {
    render(
      <Attachment>
        <AttachmentMedia data-testid="media" />
        <AttachmentContent data-testid="content">
          <AttachmentTitle>report.pdf</AttachmentTitle>
          <AttachmentDescription data-testid="description">PDF · 2.4 MB</AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions data-testid="actions">
          <AttachmentAction aria-label="Remove">×</AttachmentAction>
        </AttachmentActions>
      </Attachment>,
    );
    expect(screen.getByTestId('media').className).toContain(styles.attachmentMedia);
    expect(screen.getByTestId('media').getAttribute('data-variant')).toBe('icon');
    expect(screen.getByTestId('content').className).toContain(styles.attachmentContent);
    expect(screen.getByTestId('description').className).toContain(styles.attachmentDescription);
    expect(screen.getByTestId('actions').className).toContain(styles.attachmentActions);
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
  });

  it('treats an explicit null variant on AttachmentMedia as the icon default, in class and attribute alike', () => {
    render(
      <Attachment>
        <AttachmentMedia data-testid="media" variant={null} />
      </Attachment>,
    );
    const media = screen.getByTestId('media');
    expect(media.className).toContain(styles.variantIcon);
    expect(media.getAttribute('data-variant')).toBe('icon');
  });

  it('renders AttachmentTrigger as a button by default and supports the render prop', () => {
    render(
      <Attachment>
        <AttachmentTrigger aria-label="Open report.pdf" data-testid="trigger" />
      </Attachment>,
    );
    const trigger = screen.getByTestId('trigger');
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.getAttribute('type')).toBe('button');
    expect(trigger.className).toContain(styles.attachmentTrigger);
  });

  it('renders AttachmentTrigger via render as a link', () => {
    render(
      <Attachment>
        <AttachmentTrigger render={<a href="/files/report.pdf" />} aria-label="Open report.pdf" />
      </Attachment>,
    );
    const link = screen.getByRole('link', { name: 'Open report.pdf' });
    expect(link.className).toContain(styles.attachmentTrigger);
  });
});

describe('AttachmentGroup', () => {
  it('applies the global scroll-fade-x and no-scrollbar utility classes alongside its own layout class', () => {
    render(
      <AttachmentGroup data-testid="group">
        <Attachment />
      </AttachmentGroup>,
    );
    const group = screen.getByTestId('group');
    expect(group.className).toContain(styles.attachmentGroup);
    expect(group.className).toContain('scroll-fade-x');
    expect(group.className).toContain('no-scrollbar');
  });
});

describe('AttachmentGroup keyboard reachability', () => {
  // jsdom lays nothing out, so the row's overflow is stubbed through the two
  // widths the component compares.
  let widths = { scroll: 0, client: 0 };
  const resizeCallbacks: ResizeObserverCallback[] = [];

  beforeEach(() => {
    widths = { scroll: 0, client: 0 };
    resizeCallbacks.length = 0;
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(() => widths.scroll);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => widths.client);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallbacks.push(callback);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function renderGroup(props: Partial<AttachmentGroupProps> = {}) {
    return render(
      <AttachmentGroup data-testid="group" {...props}>
        <Attachment />
        <Attachment />
      </AttachmentGroup>,
    );
  }

  it('is a tab stop while its content overflows', () => {
    widths = { scroll: 600, client: 300 };
    renderGroup();
    expect(screen.getByTestId('group').getAttribute('tabindex')).toBe('0');
  });

  it('gains and drops the tab stop as a resize changes the overflow', () => {
    widths = { scroll: 300, client: 300 };
    renderGroup();
    const group = screen.getByTestId('group');
    expect(group.hasAttribute('tabindex')).toBe(false);

    widths = { scroll: 600, client: 300 };
    act(() => resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver)));
    expect(group.getAttribute('tabindex')).toBe('0');

    widths = { scroll: 300, client: 300 };
    act(() => resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver)));
    expect(group.hasAttribute('tabindex')).toBe(false);
  });

  it.each([
    ['with ResizeObserver', true],
    ['without ResizeObserver', false],
  ])('re-measures when attachments are added to the row (%s)', async (_name, hasResizeObserver) => {
    if (!hasResizeObserver) vi.stubGlobal('ResizeObserver', undefined);
    widths = { scroll: 300, client: 300 };
    const { rerender } = render(
      <AttachmentGroup data-testid="group">
        <Attachment />
      </AttachmentGroup>,
    );
    const group = screen.getByTestId('group');
    expect(group.hasAttribute('tabindex')).toBe(false);

    widths = { scroll: 900, client: 300 };
    rerender(
      <AttachmentGroup data-testid="group">
        <Attachment />
        <Attachment />
        <Attachment />
      </AttachmentGroup>,
    );
    await waitFor(() => expect(group.getAttribute('tabindex')).toBe('0'));
  });

  it('keeps the tab stop while focused after the row stops overflowing, and drops it on blur', () => {
    widths = { scroll: 600, client: 300 };
    renderGroup();
    const group = screen.getByTestId('group');
    act(() => group.focus());
    expect(document.activeElement).toBe(group);

    widths = { scroll: 300, client: 300 };
    act(() => resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver)));
    expect(group.getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(group);

    act(() => group.blur());
    expect(group.hasAttribute('tabindex')).toBe(false);
  });

  it('keeps a tabIndex the caller passes, overflowing or not', () => {
    widths = { scroll: 600, client: 300 };
    const { unmount } = renderGroup({ tabIndex: -1 });
    expect(screen.getByTestId('group').getAttribute('tabindex')).toBe('-1');
    unmount();

    widths = { scroll: 300, client: 300 };
    renderGroup({ tabIndex: 0 });
    expect(screen.getByTestId('group').getAttribute('tabindex')).toBe('0');
  });

  it('names the row as a group with label, and has no role without it', () => {
    const { unmount } = renderGroup({ label: 'Attached files' });
    expect(screen.getByRole('group', { name: 'Attached files' })).toBe(screen.getByTestId('group'));
    unmount();

    renderGroup();
    const group = screen.getByTestId('group');
    expect(group.hasAttribute('role')).toBe(false);
    expect(group.hasAttribute('aria-label')).toBe(false);
  });

  it('hands the caller ref the group element', () => {
    const ref = createRef<HTMLDivElement>();
    renderGroup({ ref });
    expect(ref.current).toBe(screen.getByTestId('group'));
  });
});
