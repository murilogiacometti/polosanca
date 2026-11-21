import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { installMockApi, loginViaUi, MOCK_IDS } from './fixtures/mockApi';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BLOCKING_IMPACTS = new Set(['critical', 'serious']);

async function assertMobileLayoutAndA11y(page: Page, screenLabel: string): Promise<void> {
  // Wait for any finite enter/fade transitions (e.g. .ps-view-enter) to settle so
  // axe-core measures final settled contrast rather than mid-fade opacity.
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter((a) => {
        const timing = a.effect?.getComputedTiming();
        return timing && Number.isFinite(timing.iterations);
      });
    await Promise.allSettled(finite.map((a) => a.finished));
  });

  // 1. Zero horizontal overflow on 390px mobile viewport
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));

  expect(
    metrics.scrollWidth,
    `${screenLabel}: horizontal overflow detected (scrollWidth=${metrics.scrollWidth}, innerWidth=${metrics.innerWidth})`
  ).toBeLessThanOrEqual(metrics.innerWidth);
  expect(
    metrics.bodyScrollWidth,
    `${screenLabel}: body overflow detected (bodyScrollWidth=${metrics.bodyScrollWidth}, innerWidth=${metrics.innerWidth})`
  ).toBeLessThanOrEqual(metrics.innerWidth);

  // 2. WCAG 2.1 A/AA automated accessibility audit via axe-core
  // Exclude Ant Design's internal hidden layout measurement row (.ant-table-measure-row)
  const results = await new AxeBuilder({ page })
    .exclude('.ant-table-measure-row')
    .withTags(WCAG_TAGS)
    .analyze();
  const blocking = results.violations.filter((v) => v.impact && BLOCKING_IMPACTS.has(v.impact));

  const summary = blocking.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 3).map((n) => ({
      target: n.target,
      failureSummary: n.failureSummary,
    })),
  }));

  expect(
    blocking,
    `${screenLabel}: WCAG 2.1 AA serious/critical violations:\n${JSON.stringify(summary, null, 2)}`
  ).toEqual([]);
}

async function assertMobileHeaderAccessible(page: Page, screenLabel: string): Promise<void> {
  const menuBtn = page.getByRole('button', { name: 'Abrir navegação' });
  await expect(menuBtn, `${screenLabel}: hamburger menu button must be visible`).toBeVisible();

  const box = await menuBtn.boundingBox();
  expect(box, `${screenLabel}: hamburger menu button must have a bounding box`).not.toBeNull();
  if (box) {
    expect(box.x, `${screenLabel}: hamburger menu clipped off left edge`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${screenLabel}: hamburger menu clipped off right edge`).toBeLessThanOrEqual(390);
    expect(box.width, `${screenLabel}: hamburger touch target width >= 32px`).toBeGreaterThanOrEqual(32);
    expect(box.height, `${screenLabel}: hamburger touch target height >= 32px`).toBeGreaterThanOrEqual(32);
  }
}

test.describe('Mobile Layout & WCAG 2.1 AA Accessibility (390×844)', () => {
  test('Login page passes mobile overflow & WCAG 2.1 AA checks', async ({ page }) => {
    await installMockApi(page, { role: 'global_admin' });
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /entrar na plataforma/i })).toBeVisible();

    await assertMobileLayoutAndA11y(page, 'Login');
  });

  test('Operations hierarchy (Levels 0–3) & Mobile Drawer pass overflow & WCAG 2.1 AA checks', async ({
    page,
  }) => {
    await installMockApi(page, { role: 'global_admin' });
    await loginViaUi(page, 'admin@polosanca.com');

    // Level 0 — Global
    await expect(page.getByRole('heading', { name: 'Empresas Monitoradas' })).toBeVisible();
    await assertMobileHeaderAccessible(page, 'Level 0 Global');
    await assertMobileLayoutAndA11y(page, 'Level 0 Global');

    // Level 1 — Company
    await page.getByText('Supermercados São Carlos').click();
    await expect(page).toHaveURL(new RegExp(`/operacao/empresas/${MOCK_IDS.companyA}$`));
    await expect(page.getByText('Filial Centro')).toBeVisible();
    await assertMobileHeaderAccessible(page, 'Level 1 Company');
    await assertMobileLayoutAndA11y(page, 'Level 1 Company');

    // Level 2 — Branch
    await page.getByText('Filial Centro').click();
    await expect(page).toHaveURL(
      new RegExp(`/operacao/empresas/${MOCK_IDS.companyA}/filiais/${MOCK_IDS.branchCentro}`)
    );
    await expect(page.getByText('CAM-CENTRO-002')).toBeVisible();
    await assertMobileHeaderAccessible(page, 'Level 2 Branch');
    await assertMobileLayoutAndA11y(page, 'Level 2 Branch');

    // Level 3 — Equipment
    await page.getByText('CAM-CENTRO-002').click();
    await expect(page).toHaveURL(new RegExp(`/equipamentos/${MOCK_IDS.eqCam002}$`));
    await expect(page.getByText('Telemetria Sincronizada de Causa-Raiz')).toBeVisible();
    await assertMobileHeaderAccessible(page, 'Level 3 Equipment');
    await assertMobileLayoutAndA11y(page, 'Level 3 Equipment');

    // Mobile Navigation Drawer
    await page.getByRole('button', { name: 'Abrir navegação' }).click();
    await expect(page.getByRole('menuitem', { name: /Alertas/i })).toBeVisible();
    await assertMobileLayoutAndA11y(page, 'Mobile Navigation Drawer');
    await page.keyboard.press('Escape');
  });

  test('Alerts Center & Admin Users pass mobile overflow & WCAG 2.1 AA checks', async ({
    page,
  }) => {
    await installMockApi(page, { role: 'global_admin' });
    await loginViaUi(page, 'admin@polosanca.com');

    // Alerts Center
    await page.goto('/alerts');
    await expect(page.getByRole('heading', { name: 'Central de Alertas' })).toBeVisible();
    await assertMobileHeaderAccessible(page, 'Alerts Center');
    await assertMobileLayoutAndA11y(page, 'Alerts Center');

    // Admin Users
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Usuários e Permissões' })).toBeVisible();
    await assertMobileHeaderAccessible(page, 'Admin Users');
    await assertMobileLayoutAndA11y(page, 'Admin Users');
  });
});
