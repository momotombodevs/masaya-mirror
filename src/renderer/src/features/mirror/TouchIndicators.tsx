import { useEffect, useRef, useState, type MutableRefObject } from 'react';

type Touch = {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
};

type TouchIndicatorsProps = {
  readonly canvasRef: MutableRefObject<HTMLCanvasElement | null>;
};

const RELEASE_MS = 350;

/**
 * Draws a circle under every pointer that is touching the mirrored screen, so whoever watches the
 * window sees where it is being tapped. It only listens to the canvas; it never sends input.
 */
export function TouchIndicators({ canvasRef }: TouchIndicatorsProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const [touches, setTouches] = useState<readonly Touch[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) {
      return undefined;
    }
    const timers = new Set<number>();
    const place = (event: PointerEvent, down: boolean): Touch => {
      const rect = host.getBoundingClientRect();
      return {
        id: event.pointerId,
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        down,
      };
    };
    const upsert = (touch: Touch): void =>
      setTouches((current) => [...current.filter((item) => item.id !== touch.id), touch]);
    const onDown = (event: PointerEvent): void => {
      // The right button is the "Back" shortcut: show it as a tap, but it has no drag to follow.
      upsert(place(event, event.button !== 2));
      if (event.button === 2) {
        scheduleRemoval(event.pointerId);
      }
    };
    const onMove = (event: PointerEvent): void => {
      if (canvas.hasPointerCapture(event.pointerId)) {
        upsert(place(event, true));
      }
    };
    const scheduleRemoval = (id: number): void => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        setTouches((current) => current.filter((item) => item.id !== id || item.down));
      }, RELEASE_MS);
      timers.add(timer);
    };
    const onUp = (event: PointerEvent): void => {
      upsert(place(event, false));
      scheduleRemoval(event.pointerId);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [canvasRef]);

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {touches.map((touch) => (
        <span
          key={touch.id}
          data-testid="touch-indicator"
          data-down={touch.down}
          className="absolute h-10 w-10 rounded-full border-2 border-white bg-accent/50 shadow-[0_0_0_1px_rgba(0,0,0,0.35)] transition-[opacity,transform] duration-300 ease-out"
          style={{
            left: touch.x,
            top: touch.y,
            opacity: touch.down ? 1 : 0,
            transform: `translate(-50%, -50%) scale(${touch.down ? 1 : 1.6})`,
          }}
        />
      ))}
    </div>
  );
}
