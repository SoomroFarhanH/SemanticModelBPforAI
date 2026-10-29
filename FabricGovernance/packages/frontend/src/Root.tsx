//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { ErrorBoundary } from 'react-error-boundary';

import App from './App.tsx';
import { ErrorFallback } from './ErrorFallback';
import { AuthGate } from './components/auth-gate.component';
import { ThemeContext } from './hooks/theme.context';
import { AuthProvider } from './hooks/use-auth';
import { useAppTheme } from './hooks/use-theme';
import type { IAuthService } from './services/rayfin-auth.service';

export function Root({
  rayfinAuthService,
}: {
  rayfinAuthService: IAuthService;
}) {
  const { isDark, toggleTheme } = useAppTheme();

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <AuthProvider rayfinAuthService={rayfinAuthService}>
          <AuthGate>
            <App />
          </AuthGate>
        </AuthProvider>
      </ErrorBoundary>
    </ThemeContext.Provider>
  );
}
