import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Sidebar,
  SidebarContent,
  SidebarGroupLabel,
  SidebarMenuButton,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from './sidebar';
import styles from './sidebar.module.css';

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
}

function desktopRoot() {
  return document.querySelector(`.${styles.root}`);
}

function ReadsSidebarOutsideProvider() {
  useSidebar();
  return null;
}

afterEach(() => {
  cleanup();
  // Expire the cookie so persistence assertions in one test never leak
  // into the next — SidebarProvider's lazy initializer reads it fresh on
  // every mount.
  document.cookie = 'sidebar_state=; path=/; max-age=0';
  setViewportWidth(1024);
});

describe('Sidebar', () => {
  it('throws when useSidebar is called outside a SidebarProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ReadsSidebarOutsideProvider />)).toThrow(
      'useSidebar must be used within a SidebarProvider.',
    );
    consoleError.mockRestore();
  });

  it('renders expanded by default, exposing state via data-state on the desktop root', () => {
    render(
      <SidebarProvider>
        <Sidebar />
      </SidebarProvider>,
    );
    expect(desktopRoot()?.getAttribute('data-state')).toBe('expanded');
  });

  it('toggles to collapsed on SidebarTrigger click', () => {
    render(
      <SidebarProvider>
        <Sidebar />
        <SidebarTrigger />
      </SidebarProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
    expect(desktopRoot()?.getAttribute('data-state')).toBe('collapsed');
  });

  it('sets data-collapsible to the current mode only once collapsed', () => {
    render(
      <SidebarProvider>
        <Sidebar collapsible="icon" />
        <SidebarTrigger />
      </SidebarProvider>,
    );
    expect(desktopRoot()?.getAttribute('data-collapsible')).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
    expect(desktopRoot()?.getAttribute('data-collapsible')).toBe('icon');
  });

  it('toggles on Cmd/Ctrl+B from anywhere in the document', () => {
    render(
      <SidebarProvider>
        <Sidebar />
      </SidebarProvider>,
    );
    expect(desktopRoot()?.getAttribute('data-state')).toBe('expanded');
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(desktopRoot()?.getAttribute('data-state')).toBe('collapsed');
  });

  it('persists the collapsed state in a cookie and restores it on a fresh mount', () => {
    const { unmount } = render(
      <SidebarProvider>
        <Sidebar />
        <SidebarTrigger />
      </SidebarProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
    expect(document.cookie).toContain('sidebar_state=false');
    unmount();

    // A fresh provider, still asking for defaultOpen — the cookie from the
    // unmounted instance above should win over that default.
    render(
      <SidebarProvider defaultOpen>
        <Sidebar />
      </SidebarProvider>,
    );
    expect(desktopRoot()?.getAttribute('data-state')).toBe('collapsed');
  });

  it('defers to a controlled open prop and only reports intent via onOpenChange', () => {
    const onOpenChange = vi.fn();
    render(
      <SidebarProvider open onOpenChange={onOpenChange}>
        <Sidebar />
        <SidebarTrigger />
      </SidebarProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    // The prop was never updated by the (test-harness) consumer, so the
    // rendered state must not have moved on its own.
    expect(desktopRoot()?.getAttribute('data-state')).toBe('expanded');
  });

  it('renders as a mobile Sheet below the breakpoint instead of the desktop layout', async () => {
    setViewportWidth(375);
    render(
      <SidebarProvider>
        <Sidebar>
          <SidebarContent>Mobile nav</SidebarContent>
        </Sidebar>
        <SidebarTrigger />
      </SidebarProvider>,
    );
    await waitFor(() => expect(desktopRoot()).toBeNull());
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    expect(screen.getByText('Mobile nav')).toBeTruthy();
  });

  it('renders a fixed-width panel with collapsible="none", ignoring open state', () => {
    render(
      <SidebarProvider defaultOpen={false}>
        <Sidebar collapsible="none">
          <SidebarContent>Nav</SidebarContent>
        </Sidebar>
      </SidebarProvider>,
    );
    expect(document.querySelector(`.${styles.none}`)).toBeTruthy();
    expect(desktopRoot()).toBeNull();
  });

  it('reflects isActive on SidebarMenuButton as a bare data-active attribute', () => {
    render(
      <SidebarProvider>
        <SidebarMenuButton isActive>Home</SidebarMenuButton>
      </SidebarProvider>,
    );
    // Base UI's state-attribute reflection writes booleans as an EMPTY
    // value (`data-active=""`), not the string "true" — see sidebar.tsx's
    // comment on SidebarMenuButton's `state` option.
    expect(screen.getByRole('button', { name: 'Home' }).getAttribute('data-active')).toBe('');
  });

  it('omits data-active on SidebarMenuButton when not active', () => {
    render(
      <SidebarProvider>
        <SidebarMenuButton>Home</SidebarMenuButton>
      </SidebarProvider>,
    );
    expect(screen.getByRole('button', { name: 'Home' }).hasAttribute('data-active')).toBe(false);
  });

  it('does not mount a tooltip while expanded, even with a tooltip prop', async () => {
    render(
      <SidebarProvider defaultOpen>
        <SidebarMenuButton tooltip="Homepage link">Home</SidebarMenuButton>
      </SidebarProvider>,
    );
    fireEvent.focus(screen.getByRole('button', { name: 'Home' }));
    // Absence can't be waited for positively — give Base UI's open delay a
    // moment to have fired if the collapsed/expanded gate were broken (same
    // idiom as tooltip.test.tsx's own disabled-trigger case).
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText('Homepage link')).toBeNull();
  });

  it('mounts the tooltip once the sidebar is collapsed to its icon rail', async () => {
    render(
      <SidebarProvider defaultOpen={false}>
        <SidebarMenuButton tooltip="Homepage link">Home</SidebarMenuButton>
      </SidebarProvider>,
    );
    fireEvent.focus(screen.getByRole('button', { name: 'Home' }));
    await waitFor(() => expect(screen.getByText('Homepage link')).toBeTruthy(), { timeout: 1000 });
  });

  it('renders SidebarGroupLabel as a custom element via render', () => {
    render(
      <SidebarProvider>
        <SidebarGroupLabel render={<label htmlFor="search" />}>Search</SidebarGroupLabel>
      </SidebarProvider>,
    );
    const label = screen.getByText('Search');
    expect(label.tagName).toBe('LABEL');
    expect(label.getAttribute('for')).toBe('search');
  });

  it('gives each SidebarMenuSkeleton a randomized text width within the documented range', () => {
    render(<SidebarMenuSkeleton />);
    const text = document.querySelector(`.${styles.menuSkeletonText}`) as HTMLElement;
    const width = Number.parseFloat(text.style.getPropertyValue('--skeleton-width'));
    expect(width).toBeGreaterThanOrEqual(50);
    expect(width).toBeLessThanOrEqual(90);
  });
});
