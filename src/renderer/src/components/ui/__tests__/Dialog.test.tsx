// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from '../Dialog';

afterEach(cleanup);

describe('Dialog', () => {
  it('moves focus inside and closes with Escape', () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Título" onClose={onClose} footer={<button>Cerrar</button>}>
        <p>Contenido</p>
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Título' });
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
