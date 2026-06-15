// authConfig.js — Microsoft Entra ID / MSAL configuration

const envScope = import.meta.env.VITE_ENTRA_SCOPE

export const msalConfig = {
  auth: {
    clientId:    import.meta.env.VITE_ENTRA_CLIENT_ID,
    authority:   `https://login.microsoftonline.com/${import.meta.env.VITE_ENTRA_TENANT_ID}`,
    redirectUri: import.meta.env.VITE_REDIRECT_URI || window.location.origin,
    postLogoutRedirectUri: window.location.origin,
    navigateToLoginRequestUrl: true, // Return to the page they were on after login
  },
  cache: {
    cacheLocation:          'sessionStorage', // Cleared on tab close — safer than localStorage
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return
        if (import.meta.env.DEV) console.log('[MSAL]', message)
      },
      logLevel: import.meta.env.DEV ? 'Info' : 'Warning', // Verbose in dev, quiet in prod
    },
  },
}

// Used for login — requests the backend API scope
export const loginRequest = {
  scopes:  envScope ? [envScope] : ['User.Read'],
  prompt:  'select_account', // Forces account picker — important for multi-account orgs
}

// Used for silent token acquisition on every API call
export const apiRequest = {
  scopes: envScope ? [envScope] : ['User.Read'],
}