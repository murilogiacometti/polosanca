import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { UiShellProvider } from './context/UiShellContext';
import { queryClient } from './query/queryClient';
import './index.css';

dayjs.locale('pt-br');

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Elemento raiz #root não encontrado.');
}

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <UiShellProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </UiShellProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
);
