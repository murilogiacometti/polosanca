import { expect, test } from '@playwright/test';
import { installMockApi, loginViaUi, MOCK_IDS } from './fixtures/mockApi';

test.describe('Polo Sanca — Critical User Journeys (CUJ-1 a CUJ-10)', () => {
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

    // Nível 0 -> Nível 1 (Empresa) — clica no corpo do cartão (sobre o selo "2 Filiais", fora do título)
    const branchesBadgeBox = await page.getByText('2 Filiais').boundingBox();
    expect(branchesBadgeBox).not.toBeNull();
    if (branchesBadgeBox) {
      await page.mouse.click(
        branchesBadgeBox.x + branchesBadgeBox.width / 2,
        branchesBadgeBox.y + branchesBadgeBox.height / 2
      );
    }
    await expect(page).toHaveURL(new RegExp(`/operacao/empresas/${MOCK_IDS.companyA}$`));
    await expect(page.getByText('Filial Centro')).toBeVisible();
    await expect(page.getByText('Filial Iguatemi')).toBeVisible();

    // Nível 1 -> Nível 2 (Filial Centro) — clica no selo "Abrir" do cartão
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

  test('CUJ-7: Ciclo de Autenticação (Recuperação, Redefinição, Convite e Erro 504 Sanitizado)', async ({
    page,
  }) => {
    // 1. Erro 504 HTML bruto do CloudFront deve ser sanitizado para mensagem amigável em pt-BR
    await installMockApi(page, {
      role: 'global_admin',
      loginFailure: {
        status: 504,
        contentType: 'text/html',
        body: '<!DOCTYPE HTML><HTML><HEAD><TITLE>504 Gateway Timeout</TITLE></HEAD><BODY>CloudFront error</BODY></HTML>',
      },
    });
    await page.goto('/login');
    await page.getByPlaceholder('nome@empresa.com.br').fill('admin@polosanca.com');
    await page.getByPlaceholder('Digite sua senha').fill('SenhaForte123!');
    await page.getByRole('button', { name: /entrar na plataforma/i }).click();
    await expect(page.getByText(/servidor está temporariamente indisponível/i)).toBeVisible();
    await expect(page.getByText(/DOCTYPE/i)).toBeHidden();

    // 2. Recuperar senha (/forgot-password)
    await page.getByRole('link', { name: /Esqueceu sua senha/i }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByRole('heading', { name: 'Recuperar Senha' })).toBeVisible();
    await page.getByLabel('E-mail cadastrado').fill('operador@supermercados.com');
    await page.getByRole('button', { name: /Enviar Link de Redefinição/i }).click();
    await expect(page.getByText('Instruções enviadas!')).toBeVisible();

    // 3. Redefinir senha via link com token (/reset-password?token=...)
    await page.goto('/reset-password?token=mock-reset-token-123');
    await page.getByPlaceholder('Mínimo de 8 caracteres').fill('NovaSenhaForte123!');
    await page.getByPlaceholder('Repita a nova senha').fill('NovaSenhaForte123!');
    await page.getByRole('button', { name: /Salvar Nova Senha/i }).click();
    await expect(page.getByText('Senha redefinida com sucesso!')).toBeVisible();

    // 4. Aceitar convite via link com token (/accept-invitation?token=...)
    await page.goto('/accept-invitation?token=mock-invite-token-456');
    await page.getByPlaceholder('Mínimo de 8 caracteres').fill('SenhaConvite123!');
    await page.getByPlaceholder('Repita sua senha').fill('SenhaConvite123!');
    await page.getByRole('button', { name: /Ativar Conta/i }).click();
    await expect(page.getByText('Conta ativada com sucesso!')).toBeVisible();
  });

  test('CUJ-8: Admin Empresa (Nível 1 -> 2 -> 3), Voltar via UI, Nova Filial e Chave API IoT', async ({
    page,
  }) => {
    await installMockApi(page, { role: 'company_admin' });
    await loginViaUi(page, 'fernanda@supermercados.com');

    // Company Admin entra direto no Nível 1 (sua empresa), sem passar pelo Nível 0
    await expect(page).toHaveURL(new RegExp(`/operacao/empresas/${MOCK_IDS.companyA}$`));
    await expect(page.getByRole('heading', { name: 'Supermercados São Carlos' })).toBeVisible();

    // Cria nova filial pelo Nível 1
    await page.getByRole('button', { name: /Nova Filial/i }).click();
    await page.getByPlaceholder('Ex.: Filial 01 — Centro').fill('Filial Sul');
    await page.getByPlaceholder('Ex.: Av. São Carlos, 1500 — São Carlos/SP').fill('Av. Getúlio Vargas, 800');
    await page.getByRole('button', { name: 'Criar Filial' }).click();
    await expect(page.getByText('Filial Sul')).toBeVisible();

    // Entra no Nível 2 (Filial Centro) e cadastra novo equipamento com revelação da Chave API
    await page.getByText('Filial Centro').click();
    await expect(page).toHaveURL(
      new RegExp(`/operacao/empresas/${MOCK_IDS.companyA}/filiais/${MOCK_IDS.branchCentro}$`)
    );

    await page.getByRole('button', { name: /Novo Equipamento/i }).click();
    await page.getByPlaceholder('Ex.: FRZ-SP-001').fill('CAM-NOVA-099');
    await page.getByPlaceholder('Ex.: Metalfrio, Gelopar, Danfoss').fill('Elgin');
    await page.getByRole('button', { name: /Cadastrar e Gerar Chave/i }).click();
    await expect(page.getByTestId('plaintext-api-key')).toHaveText('ps_live_mock_key_0001');
    await page.getByRole('button', { name: /Já copiei e salvei em local seguro/i }).click();
    await expect(page.getByRole('button', { name: 'CAM-NOVA-099', exact: true })).toBeVisible();

    // Entra no Nível 3 (CAM-CENTRO-002) e navega de volta via botões "Voltar para ..."
    await page.getByText('CAM-CENTRO-002').click();
    await expect(page).toHaveURL(new RegExp(`/equipamentos/${MOCK_IDS.eqCam002}$`));
    await page.getByRole('button', { name: /Voltar para Filial Centro/i }).click();
    await expect(page).toHaveURL(
      new RegExp(`/operacao/empresas/${MOCK_IDS.companyA}/filiais/${MOCK_IDS.branchCentro}$`)
    );
    await page.getByRole('button', { name: /Voltar para Supermercados São Carlos/i }).click();
    await expect(page).toHaveURL(new RegExp(`/operacao/empresas/${MOCK_IDS.companyA}$`));
  });

  test('CUJ-9: Registro de Manutenção Preventiva no Nível 3 e Triagem em Lote na Central de Alertas', async ({
    page,
  }) => {
    await installMockApi(page, { role: 'global_admin' });
    await loginViaUi(page);

    // 1. Nível 3 -> Registra nova manutenção preventiva
    await page.goto(
      `/operacao/empresas/${MOCK_IDS.companyA}/filiais/${MOCK_IDS.branchCentro}/equipamentos/${MOCK_IDS.eqCam002}`
    );
    await page.getByRole('button', { name: /\+ Manutenção/i }).click();
    await page
      .getByPlaceholder('Ex.: João Pereira — Refrigeração Técnica')
      .fill('Técnico Marcos PoloSanca');
    await page
      .getByPlaceholder(/Limpeza do condensador/i)
      .fill('Troca de gaxeta da porta e calibração de termostato');
    await page.getByRole('button', { name: 'Registrar Manutenção' }).click();

    await page.getByText(/Manutenções \(/i).click();
    await expect(page.getByText('Técnico Marcos PoloSanca')).toBeVisible();

    // 2. Central de Alertas -> Seleciona todos os alertas ativos e reconhece em lote com nota rápida
    await page.goto('/alerts');
    await expect(page.getByRole('heading', { name: 'Central de Alertas' })).toBeVisible();
    await page.locator('thead input[type="checkbox"]').check();
    await page.getByRole('button', { name: /Reconhecer selecionados \(2\)/i }).click();
    await page.getByRole('button', { name: /\+ Queda de energia na rede/i }).click();
    await page.getByRole('button', { name: /Confirmar Reconhecimento/i }).click();

    // Badge de alertas ativos na sidebar desaparece (0 ativos)
    await expect(page.locator('.ps-sidebar-alert-pill')).toBeHidden();
  });

  test('CUJ-10: Convite de Operador no Admin e Persistência do Tema Sala de Controle (Escuro)', async ({
    page,
  }) => {
    await installMockApi(page, { role: 'global_admin' });
    await loginViaUi(page);

    // 1. Convida novo usuário em /admin
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Usuários e Permissões' })).toBeVisible();
    await page.getByRole('button', { name: /Convidar Usuário/i }).click();
    await page.getByPlaceholder('Ex.: Ana Paula Souza').fill('Ana Paula Souza');
    await page.getByPlaceholder('ana.souza@empresa.com.br').fill('ana.souza@supermercados.com');
    await page.getByLabel('Empresa Vinculada').click();
    await page.locator('.ant-select-item-option', { hasText: 'Supermercados São Carlos' }).click();
    await page.getByRole('button', { name: 'Enviar Convite' }).click();

    await expect(page.getByText('ana.souza@supermercados.com')).toBeVisible();

    // 2. Ativa Tema Sala de Controle (Escuro) pelo menu do perfil e valida persistência após reload
    await page.getByRole('button', { name: /Conta de Carlos Silva/i }).click();
    await page.getByText('Tema Sala de Controle (Escuro)').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
