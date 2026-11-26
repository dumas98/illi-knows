import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Switches the demo "View as" menu and waits for the persona's home page. */
export async function viewAs(page: Page, label: 'Landing page' | 'Denise, student' | 'Tim, organizer' | 'Alex, admin') {
  await page.getByLabel('View as').selectOption({ label });
  if (label !== 'Landing page') await expect(page.getByText(`Now viewing as ${label}`)).toBeVisible();
}

/** Fails on serious or critical WCAG 2.1 AA problems that axe can detect on the current page. */
export async function expectAccessible(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const problems = results.violations
    .filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`);
  expect(problems, `Accessibility problems on ${name}`).toEqual([]);
}

/** The page itself never scrolls sideways (inner scrollers like the week grid are fine). */
export async function expectNoSidewaysScroll(page: Page, name: string) {
  const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(scroll, `${name} scrolls sideways`).toBeLessThanOrEqual(width);
}
