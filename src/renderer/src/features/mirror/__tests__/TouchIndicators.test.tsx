// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TouchIndicators } from '../TouchIndicators';

function setup(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.hasPointerCapture = () => true;
  document.body.append(canvas);
  render(<TouchIndicators canvasRef={{ current: canvas }} />);
  return canvas;
}

function fire(canvas: HTMLCanvasElement, type: string, init: Record<string, number> = {}): void {
  const event = new MouseEvent(type, { clientX: 20, clientY: 30, button: 0, ...init });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  act(() => {
    canvas.dispatchEvent(event);
  });
}

describe('TouchIndicators', () => {
  it('shows a circle while pressed and removes it after release', () => {
    vi.useFakeTimers();
    const canvas = setup();

    fire(canvas, 'pointerdown');
    expect(screen.getByTestId('touch-indicator').getAttribute('data-down')).toBe('true');

    fire(canvas, 'pointerup');
    expect(screen.getByTestId('touch-indicator').getAttribute('data-down')).toBe('false');

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.queryByTestId('touch-indicator')).toBeNull();
    vi.useRealTimers();
  });
});
