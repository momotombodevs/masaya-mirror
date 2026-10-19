import type { ReactNode } from 'react';

/** Error message pinned to the bottom of a positioned dark container. */
export function OverlayError({ children }: { readonly children: ReactNode }): JSX.Element {
  return (
    <p
      role="alert"
      className="absolute inset-x-3 bottom-3 z-[2] rounded-panel bg-mirror-bar px-3 py-2 text-sm text-red-300 shadow-sheet"
    >
      {children}
    </p>
  );
}
