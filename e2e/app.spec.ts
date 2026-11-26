import { expect, test } from '@playwright/test';
import { expectAccessible, expectNoSidewaysScroll, viewAs } from './helpers';

test.describe.configure({ mode: 'serial' });

const TITLE = 'E2E listening party';

test('a guest browses every Discover view and is asked to sign in to RSVP', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'This week around campus' })).toBeVisible();
  await expect(page).toHaveTitle('Illi-Knows · Campus events');
  await expectAccessible(page, 'the landing page');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Discover' }).click();
  await expect(page.getByRole('heading', { name: 'Discover events' })).toBeVisible();
  await expect(page.locator('.hcard').first()).toBeVisible();
  await expect(page).toHaveTitle('Discover events · Illi-Knows');
  await expectAccessible(page, 'Discover, list');

  await page.getByRole('group', { name: 'Layout' }).getByRole('button', { name: 'Week' }).click();
  await expect(page.locator('.wk')).toBeVisible();
  await expect(page.getByText(/events? this week/)).toBeVisible();
  await expectAccessible(page, 'Discover, week');

  await page.getByRole('group', { name: 'Layout' }).getByRole('button', { name: 'Map' }).click();
  await expect(page.getByText(/Numbers match the list/)).toBeVisible();
  await expectAccessible(page, 'Discover, map');

  await page.getByRole('group', { name: 'Layout' }).getByRole('button', { name: 'List' }).click();
  const first = page.locator('.hcard').first();
  const name = (await first.locator('h3').textContent())!;
  await first.click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page).toHaveTitle(`${name} · Illi-Knows`);
  await expectAccessible(page, 'an event page');

  await page.getByRole('button', { name: 'RSVP', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Sign in to RSVP' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep browsing' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('Denise RSVPs anonymously and finds it in her planner', async ({ page }) => {
  await page.goto('/');
  await viewAs(page, 'Denise, student');
  await page.goto('/discover?when=next-week');
  const card = page.locator('.hcard').first();
  const name = (await card.locator('h3').textContent())!;
  await card.click();
  await page.getByRole('button', { name: 'RSVP anonymously' }).click();
  await expect(page.getByText(`You're going to ${name} anonymously`)).toBeVisible();
  await expect(page.getByText('Going anonymously')).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /My planner/ }).click();
  await expect(page.getByRole('heading', { name: 'Your planner' })).toBeVisible();
  const entry = page.locator('.entry', { hasText: name });
  await expect(entry).toContainText('Going anonymously');
  await expectAccessible(page, 'the planner');
});

test('Tim posts an event and sees it waiting for review', async ({ page }) => {
  await page.goto('/');
  await viewAs(page, 'Tim, organizer');
  await expect(page).toHaveURL(/\/organize$/);
  await expect(page.getByRole('heading', { name: 'Your events', exact: true })).toBeVisible();
  await expectAccessible(page, 'Manage events');

  await page.getByRole('link', { name: 'Create event' }).first().click();
  await expect(page.getByRole('heading', { name: 'Create event' })).toBeVisible();
  await expectAccessible(page, 'the create event form');
  await page.getByRole('button', { name: 'Send for review' }).click();
  await expect(page.getByText('Enter an event name.')).toBeVisible();

  await page.getByLabel('Event name').fill(TITLE);
  await page.getByLabel('Campus place').fill('Illini Union');
  await page.getByLabel('Room or spot (optional)').fill('Room 210');
  await page.getByLabel('Description').fill('Bring a record; we play one side each.');
  await page.getByRole('button', { name: 'Send for review' }).click();
  await expect(page.getByText(`${TITLE} sent for review`)).toBeVisible();
  await expect(page).toHaveURL(/\/organize$/);
  const row = page.getByRole('row', { name: new RegExp(TITLE) });
  await expect(row).toContainText('In review');
  await expect(row).toContainText('Illini Union, Room 210');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Insights' }).click();
  await expect(page.getByText('RSVPs in the two weeks before the event')).toBeVisible();
  await expectAccessible(page, 'Insights');
});

test('Alex approves it, and it shows up on Discover', async ({ page }) => {
  await page.goto('/');
  await viewAs(page, 'Alex, admin');
  await expect(page).toHaveURL(/\/review$/);
  await expect(page.getByRole('heading', { name: /Check it before it goes/ })).toBeVisible();
  await expectAccessible(page, 'the review queue');

  const listing = page.getByRole('article', { name: TITLE });
  await expect(listing).toContainText('Submitted by Tim Okafor');
  await listing.getByRole('button', { name: `Approve ${TITLE}` }).click();
  await expect(page.getByText(`${TITLE} approved and published`)).toBeVisible();

  await page.goto(`/discover?q=${encodeURIComponent('listening party')}`);
  await expect(page.locator('.hcard', { hasText: TITLE })).toBeVisible();
});

test('nothing scrolls sideways on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of ['/', '/discover', '/discover?view=week', '/discover?view=map', '/planner', '/organize', '/review']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expectNoSidewaysScroll(page, path);
  }
  await page.goto('/');
  await viewAs(page, 'Alex, admin');
  await page.waitForLoadState('networkidle');
  await expectNoSidewaysScroll(page, 'the review queue');
  await expectAccessible(page, 'the review queue on a phone');
});
