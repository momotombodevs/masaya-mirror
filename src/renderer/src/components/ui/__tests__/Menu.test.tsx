// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Menu } from '../Menu';

const onVolume = vi.fn();
const onSettings = vi.fn();

const renderMenu = (disabled = false): void => {
  render(
    <Menu
      label="Más opciones"
      disabled={disabled}
      items={[
        { label: 'Subir volumen', onSelect: onVolume },
        { label: 'Instalar APK…', onSelect: vi.fn(), disabled: true, separatorBefore: true },
        { label: 'Ajustes…', onSelect: onSettings },
      ]}
    >
      ⋯
    </Menu>,
  );
};

describe('Menu', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const open = (): void => {
    fireEvent.click(screen.getByRole('button', { name: 'Más opciones' }));
  };

  it('starts closed and opens from its button', () => {
    renderMenu();
    expect(screen.queryByRole('menu')).toBeNull();

    open();

    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Más opciones' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('runs the picked item and closes', () => {
    renderMenu();
    open();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Ajustes…' }));

    expect(onSettings).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('does not run a disabled item', () => {
    renderMenu();
    open();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Instalar APK…' }));

    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('closes with Escape and with a click outside', () => {
    renderMenu();
    open();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();

    open();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('keeps the menu open when the click is inside it', () => {
    renderMenu();
    open();

    fireEvent.pointerDown(screen.getByRole('menu'));

    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('cannot be opened while disabled', () => {
    renderMenu(true);

    open();

    expect(screen.queryByRole('menu')).toBeNull();
  });
});
