import type { ReactNode } from 'react';

/** Error banner pinned to the bottom of a positioned dark container. */
export function OverlayError({ children }: { readonly children: ReactNode }): JSX.Element {
  return (
    <p
      role="alert"
      className="absolute inset-x-4 bottom-4 z-[2] rounded-md border border-mirror-danger-border bg-mirror-danger-bg px-4 py-3 text-sm text-mirror-danger-text shadow-popover"
    >
      {children}
    </p>
  );
}
