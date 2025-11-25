/**
 * Dados oficiais de contato e suporte técnico — PoloSanca Refrigeração
 * Fonte: https://polosancarefrigeracao.com.br/
 */

interface WhatsappChannel {
  label: string;
  contactName: string;
  url: string;
}

export interface PoloSancaContactInfo {
  brandName: string;
  tagline: string;
  location: string;
  websiteUrl: string;
  websiteLabel: string;
  email: string;
  primaryWhatsapp: {
    label: string;
    role: string;
    url: string;
  };
  whatsappChannels: WhatsappChannel[];
}

export const POLOSANCA_CONTACT: PoloSancaContactInfo = {
  brandName: 'PoloSanca Refrigeração',
  tagline: 'Refrigeração Industrial, Comercial e Monitoramento Inteligente',
  location: 'São Carlos - SP • Atendimento em todo o Brasil',
  websiteUrl: 'https://polosancarefrigeracao.com.br/',
  websiteLabel: 'polosancarefrigeracao.com.br',
  email: 'contato@polosancarefrigeracao.com.br',
  primaryWhatsapp: {
    label: '(16) 99616-6015',
    role: 'Central de Atendimento e Plantão',
    url: 'https://wa.me/5516996166015?text=Ol%C3%A1%2C%20preciso%20de%20suporte%20na%20plataforma%20de%20monitoramento%20PoloSanca.',
  },
  whatsappChannels: [
    {
      label: '(16) 99616-6015',
      contactName: 'Atendimento / Suporte',
      url: 'https://wa.me/5516996166015?text=Ol%C3%A1%2C%20preciso%20de%20suporte%20na%20plataforma%20de%20monitoramento%20PoloSanca.',
    },
    {
      label: '(16) 99243-5514',
      contactName: 'Antonio Carlos',
      url: 'https://wa.me/5516992435514?text=Ol%C3%A1%2C%20falo%20a%20partir%20do%20sistema%20de%20monitoramento%20PoloSanca.',
    },
    {
      label: '(16) 99117-3642',
      contactName: 'Pedro Giacometi',
      url: 'https://wa.me/5516991173642?text=Ol%C3%A1%2C%20falo%20a%20partir%20do%20sistema%20de%20monitoramento%20PoloSanca.',
    },
  ],
};
