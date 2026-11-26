import { useEffect } from 'react';

/** Sets the browser tab title, which is also the first thing a screen reader announces on a new page. */
export function usePageTitle(title: string | null | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} · Illi-Knows` : 'Illi-Knows · Campus events';
  }, [title]);
}
