import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { installMockApi, loginViaUi, MOCK_IDS } from './fixtures/mockApi';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BLOCKING_IMPACTS = new Set(['critical', 'serious']);
const MIN_INTERACTIVE_TARGET_PX = 24;
const MIN_PRIMARY_BUTTON_PX = 36;

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
    `${screenLabel}: WCAG 2.2 AA serious/critical violations:\n${JSON.stringify(summary, null, 2)}`
  ).toEqual([]);

  // 3. Touch-target size sweep across visible buttons (WCAG 2.2 SC 2.5.8 >= 24×24px floor;
  //    header/primary controls >= 36×36px)
  const undersized = await page.evaluate(
    ({ minFloor, minPrimary }) => {
      const issues: Array<{ label: string; width: number; height: number; required: number }> = [];
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const btn of buttons) {
        if (btn.disabled || btn.classList.contains('ps-card-stretch-btn')) continue;
        const style = window.getComputedStyle(btn);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          continue;
        }
        const rect = btn.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        // Skip buttons scrolled horizontally outside a scroll container or below/above viewport
        if (rect.right < 0 || rect.left > window.innerWidth) continue;

        const isHeaderControl = Boolean(btn.closest('header'));
        const isIconOnly = (btn.textContent || '').trim().length === 0;
        const required = isHeaderControl || isIconOnly ? minPrimary : minFloor;

        if (rect.width < required || rect.height < required) {
          const label =
            btn.getAttribute('aria-label') ||
            (btn.textContent || '').trim().slice(0, 40) ||
            btn.className;
          issues.push({
            label,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            required,
          });
        }
      }
      return issues;
    },
    { minFloor: MIN_INTERACTIVE_TARGET_PX, minPrimary: MIN_PRIMARY_BUTTON_PX }
  );

  expect(
    undersized,
    `${screenLabel}: undersized mobile touch targets:\n${JSON.stringify(undersized, null, 2)}`
  ).toEqual([]);

  // 4. Mobile typography & pinch-zoom checks:
  //    - Viewport meta must allow pinch-zoom (WCAG 1.4.4)
  //    - Visible text inputs must be >= 16px to prevent iOS Safari auto-zoom
  const typographyIssues = await page.evaluate(() => {
    const issues: string[] = [];

    const viewportMeta = document.querySelector('meta[name="viewport"]');
    const content = viewportMeta?.getAttribute('content') || '';
    if (/user-scalable\s*=\s*(no|0)/i.test(content) || /maximum-scale\s*=\s*1(\.0)?\b/i.test(content)) {
      issues.push(`Viewport blocks pinch-zoom: "${content}"`);
    }

    const inputs = Array.from(
      document.querySelectorAll(
        'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), textarea'
      )
    );
    for (const el of inputs) {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const fontSize = parseFloat(style.fontSize);
      if (fontSize < 16) {
        const label =
          el.getAttribute('aria-label') ||
          el.getAttribute('placeholder') ||
          el.getAttribute('id') ||
          el.tagName;
        issues.push(`Input "${label}" font-size is ${fontSize}px (< 16px triggers iOS auto-zoom)`);
      }
    }

    return issues;
  });

  expect(
    typographyIssues,
    `${screenLabel}: mobile typography / zoom issues:\n${typographyIssues.join('\n')}`
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
    expect(box.width, `${screenLabel}: hamburger touch target width >= 36px`).toBeGreaterThanOrEqual(36);
    expect(box.height, `${screenLabel}: hamburger touch target height >= 36px`).toBeGreaterThanOrEqual(36);
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
