import { expect, test } from '@playwright/test';
import { installMockApi, loginViaUi, MOCK_IDS } from './fixtures/mockApi';

test.describe('Polo Sanca — Critical User Journeys (CUJ-1 a CUJ-6)', () => {
  test('CUJ-1: Login adaptativo por perfil (Global Admin vs Viewer Restrito) e bloqueio RBAC', async ({
    page,
  }) => {
    await installMockApi(page, { role: 'global_admin' });
    await loginViaUi(page, 'admin@polosanca.com');

    // Global Admin entra no Nível 0 (Todas as Empresas)
    await expect(page).toHaveURL(/\/operacao$/);
    await expect(page.getByRole('heading', { name: 'Empresas Monitoradas' })).toBeVisible();
    await expect(page.getByText('Supermercados São Carlos')).toBeVisible();
    await expect(page.getByText('Frigorífico Serra Azul')).toBeVisible();

    // Testa Visualizador Restrito a 1 filial -> pula direto para Nível 2 e bloqueia /admin
    await page.evaluate(() => localStorage.clear());
    await page.unroute('**/v1/**');
    await installMockApi(page, {
      role: 'company_viewer',
      restrictedBranchId: MOCK_IDS.branchCentro,
    });

    await loginViaUi(page, 'joao@supermercados.com');
    await expect(page).toHaveURL(
      new RegExp(`/operacao/empresas/${MOCK_IDS.companyA}/filiais/${MOCK_IDS.branchCentro}`)
    );
    await expect(page.getByRole('heading', { name: 'Filial Centro' })).toBeVisible();
    await expect(page.getByText('CAM-CENTRO-002')).toBeVisible();

    // Tenta acessar /admin diretamente -> redireciona para /operacao (e volta para a filial permitida)
    await page.goto('/admin');
    await expect(page).toHaveURL(new RegExp(`/operacao/empresas/${MOCK_IDS.companyA}/filiais/`));
  });

  test('CUJ-2: Zoom Semântico em 4 Níveis, Cartões/Lista, ⌘K e suspensão de atalhos em Modais', async ({
    page,
  }) => {
    await installMockApi(page, { role: 'global_admin' });
    await loginViaUi(page);

    // Nível 0 -> Nível 1 (Empresa)
    await page.getByText('Supermercados São Carlos').click();
    await expect(page).toHaveURL(new RegExp(`/operacao/empresas/${MOCK_IDS.companyA}$`));
    await expect(page.getByText('Filial Centro')).toBeVisible();
    await expect(page.getByText('Filial Iguatemi')).toBeVisible();

    // Nível 1 -> Nível 2 (Filial Centro)
    await page.getByText('Filial Centro').click();
    await expect(page).toHaveURL(
      new RegExp(`/operacao/empresas/${MOCK_IDS.companyA}/filiais/${MOCK_IDS.branchCentro}`)
    );
    await expect(page.getByText('CAM-CENTRO-002')).toBeVisible();
    await expect(page.getByText('FRZ-CENTRO-003')).toBeVisible();

    // Alterna Cartões -> Lista e verifica coluna de mini sparkline 24h
    await page.getByText('Lista', { exact: true }).click();
    await expect(page.getByRole('columnheader', { name: /Tendência 24h/i })).toBeVisible();
    await page.getByText('Cartões', { exact: true }).click();

    // Nível 2 -> Nível 3 (Equipamento CAM-CENTRO-002)
    await page.getByText('CAM-CENTRO-002').click();
    await expect(page).toHaveURL(new RegExp(`/equipamentos/${MOCK_IDS.eqCam002}$`));

    // Abre modal de Acesso Rápido via botão "Ir para..." e confirma que Esc fecha o modal SEM sair do Nível 3
    await page.getByRole('button', { name: /Ir para/i }).click();
    await expect(page.getByPlaceholder(/Ir para empresa, filial, câmara fria/i)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/equipamentos/${MOCK_IDS.eqCam002}$`));

    // Navegação por teclado J para próximo equipamento irmão (CAM-CENTRO-004)
    await page.keyboard.press('j');
    await expect(page).toHaveURL(new RegExp(`/equipamentos/${MOCK_IDS.eqCam004}$`));

    // Esc fora de modais sobe de Nível 3 -> Nível 2
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(
      new RegExp(`/operacao/empresas/${MOCK_IDS.companyA}/filiais/${MOCK_IDS.branchCentro}$`)
    );
  });

  test('CUJ-3: Diagnóstico de Causa-Raiz no Nível 3 e "Focar no Gráfico" (Fixado)', async ({
    page,
  }) => {
    await installMockApi(page, { role: 'global_admin' });
    await loginViaUi(page);

    await page.goto(
      `/operacao/empresas/${MOCK_IDS.companyA}/filiais/${MOCK_IDS.branchCentro}/equipamentos/${MOCK_IDS.eqCam002}`
    );

    // Verifica os 4 cartões KPI do cabeçalho operacional
    await expect(page.getByText('Temperatura Atual')).toBeVisible();
    await expect(page.getByText('Pressão de Sucção', { exact: true })).toBeVisible();
    await expect(page.getByText('Estado de Operação (Relés)')).toBeVisible();
    await expect(page.getByText('Plano Preventivo')).toBeVisible();

    // Verifica o painel de Telemetria Sincronizada de Causa-Raiz e a tabela de Alertas
    await expect(page.getByText('Telemetria Sincronizada de Causa-Raiz')).toBeVisible();
    const focusBtn = page.getByRole('button', { name: /Focar no Gráfico/i }).first();
    await expect(focusBtn).toBeVisible();
    await focusBtn.click();

    // Faixa escura de inspeção trava com badge "Fixado" e botão "Limpar foco"
    await expect(page.getByText('Fixado', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Limpar foco/i })).toBeVisible();

    // Alterna visibilidade da Curva de Pressão
    const pressureToggle = page.getByLabel('Curva de Pressão');
    await expect(pressureToggle).toBeChecked();
    await pressureToggle.uncheck();
    await expect(pressureToggle).not.toBeChecked();
  });

  test('CUJ-4: Contingência Sanitária Offline e Registro Manual em 1 Toque', async ({ page }) => {
    const api = await installMockApi(page, { role: 'global_admin' });
    await loginViaUi(page);

    await page.goto(
      `/operacao/empresas/${MOCK_IDS.companyA}/filiais/${MOCK_IDS.branchIguatemi}/equipamentos/${MOCK_IDS.eqRefOffline}`
    );

    // Unidade offline mostra indicador de leitura congelada e banner acionável
    await expect(page.getByText('Congelada', { exact: true })).toBeVisible();
    const contingencyBtn = page.getByRole('button', { name: /Registrar Leitura de Contingência/i });
    await expect(contingencyBtn).toBeVisible();
    await contingencyBtn.click();

    // Interage com stepper tátil e chip de observação rápida
    await page.getByRole('button', { name: /\+0,5 °C/i }).click();
    await page.getByRole('button', { name: /\+ Queda de Wi-Fi na loja/i }).click();
    await page.getByRole('button', { name: 'Registrar Leitura Manual' }).click();

    await expect.poll(() => api.getManualSubmissionsCount()).toBe(1);

    // Abre aba Leituras e confirma o novo registro manual
    await page.getByText(/Leituras \(/i).click();
    await expect(page.getByText(/Manual \(Offline\)/i)).toBeVisible();
  });

  test('CUJ-5: Triagem de Alertas e Sincronização Reativa do Badge na Sidebar', async ({
    page,
  }) => {
    await installMockApi(page, { role: 'global_admin' });
    await loginViaUi(page);

    // Sidebar exibe 2 alertas ativos inicialmente
    const sidebarAlertBadge = page.locator('.ps-sidebar-alert-pill');
    await expect(sidebarAlertBadge).toHaveText('2');

    // Navega para a Central de Alertas
    await page.getByRole('menuitem', { name: /Alertas/i }).click();
    await expect(page).toHaveURL(/\/alerts/);
    await expect(page.getByRole('heading', { name: 'Central de Alertas' })).toBeVisible();

    // Reconhece o primeiro alerta ativo -> TanStack Query invalida e atualiza badge para 1 sem reload
    await page.getByRole('button', { name: /Reconhecer/i }).first().click();
    await expect(sidebarAlertBadge).toHaveText('1');
  });

  test('CUJ-6: Regras de Alerta, Usuários e Trilha de Auditoria (Administração)', async ({
    page,
  }) => {
    await installMockApi(page, { role: 'global_admin' });
    await loginViaUi(page);

    // Regras de Alerta (/alerts?tab=rules)
    await page.goto('/alerts?tab=rules');
    await expect(page.getByText('Temperatura Alta Câmara Fria')).toBeVisible();

    // Administração -> Usuários
    await page.getByRole('menuitem', { name: /Administração/i }).click();
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByText('joao@supermercados.com')).toBeVisible();

    // Administração -> Trilha de Auditoria
    await page.getByText(/Trilha de Auditoria/i).click();
    await expect(page.getByRole('heading', { name: /Trilha de Auditoria Imutável/i })).toBeVisible();
    await expect(page.getByText('Atualização de equipamento')).toBeVisible();
  });
});
