import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './alert-dialog';
import styles from './alert-dialog.module.css';

afterEach(cleanup);

function renderAlertDialog(onAction = vi.fn()) {
  render(
    <AlertDialog>
      <AlertDialogTrigger>Delete account</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onAction}>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>,
  );
  return onAction;
}

describe('AlertDialog', () => {
  it('renders a trigger and keeps the popup out of the DOM until opened', () => {
    renderAlertDialog();
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('opens on trigger click and renders content with kit classes', () => {
    renderAlertDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    const popup = screen.getByRole('alertdialog');
    expect(popup.className).toContain(styles.popup);
    expect(screen.getByText('Are you absolutely sure?').className).toContain(styles.title);
    expect(screen.getByText('This action cannot be undone.').className).toContain(
      styles.description,
    );
  });

  // An alert dialog demands an explicit choice — unlike Dialog/Popover,
  // Base UI's AlertDialog does not close on outside press.
  it('does not close on outside click', async () => {
    renderAlertDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);
    fireEvent.click(document.body);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });

  it('closes via AlertDialogCancel', async () => {
    renderAlertDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('runs the action handler and closes via AlertDialogAction', async () => {
    const onAction = renderAlertDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  // The escape hatch an async confirm needs: keep the dialog up while the
  // work runs, without giving up the Close semantics for every other case.
  it('keeps the dialog open when the action handler prevents the Base UI handler', async () => {
    render(
      <AlertDialog>
        <AlertDialogTrigger>Delete account</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogFooter>
            <AlertDialogAction onClick={(event) => event.preventBaseUIHandler()}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });

  it('renders the backdrop by default', () => {
    renderAlertDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    expect(document.querySelector(`.${styles.backdrop}`)).toBeTruthy();
  });

  it('omits the backdrop when showBackdrop is false', () => {
    render(
      <AlertDialog defaultOpen>
        <AlertDialogTrigger>Delete account</AlertDialogTrigger>
        <AlertDialogContent showBackdrop={false}>
          <AlertDialogTitle>No backdrop</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>,
    );
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(document.querySelector(`.${styles.backdrop}`)).toBeNull();
  });

  it('stamps data-size on the popup for the footer/width CSS to key off', () => {
    render(
      <AlertDialog defaultOpen>
        <AlertDialogTrigger>Delete account</AlertDialogTrigger>
        <AlertDialogContent size="sm">
          <AlertDialogTitle>Small</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>,
    );
    expect(screen.getByRole('alertdialog').getAttribute('data-size')).toBe('sm');
  });

  it('portals the popup into a provided container', () => {
    const container = document.createElement('div');
    container.id = 'themed-section';
    document.body.appendChild(container);
    render(
      <AlertDialog defaultOpen>
        <AlertDialogTrigger>Delete account</AlertDialogTrigger>
        <AlertDialogContent container={container}>
          <AlertDialogTitle>Themed</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>,
    );
    const popup = screen.getByRole('alertdialog');
    expect(container.contains(popup)).toBe(true);
    container.remove();
  });
});
