// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavigationBar } from '../NavigationBar';

const sendControl = vi.fn().mockResolvedValue({ ok: true, value: undefined });

describe('NavigationBar', () => {
  beforeEach(() => {
    sendControl.mockClear();
    vi.stubGlobal('manolo', { sendControl });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each([
    ['Atrás', 4],
    ['Inicio', 3],
    ['Apps recientes', 187],
  ])('%s presses Android key %i on the device', (name, keyCode) => {
    render(<NavigationBar deviceId="device-1" />);

    fireEvent.click(screen.getByRole('button', { name }));

    expect(sendControl.mock.calls.map(([, message]) => message)).toEqual([
      expect.objectContaining({ type: 'key', action: 0, keyCode }),
      expect.objectContaining({ type: 'key', action: 1, keyCode }),
    ]);
  });

  it('is inert while disabled', () => {
    render(<NavigationBar deviceId="device-1" disabled />);

    fireEvent.click(screen.getByRole('button', { name: 'Inicio' }));

    expect(sendControl).not.toHaveBeenCalled();
  });
});
