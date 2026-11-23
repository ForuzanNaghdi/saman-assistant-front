# Keycloak Integration Guide

How to add Keycloak authentication to a Vite + React + TypeScript project (like Safineh), as a single app — no microfrontend / module federation involved.

The guide follows the same pattern used in this repository:

```
npm install keycloak-js        →  Step 1
define environment variables   →  Step 2
public/silent-check-sso.html   →  Step 3
AuthService (singleton)        →  Step 4
bootstrap in main.tsx          →  Step 5
attach token to HTTP client    →  Step 6
use auth anywhere in the app   →  Step 7
```

---

## 📚 Official documentation

The primary reference for everything in this guide (`init()` options, silent `check-sso`, PKCE, `updateToken()`, login/logout, events):

> **Keycloak JavaScript Adapter Guide**
> 🔗 https://www.keycloak.org/securing-apps/javascript-adapter

Other useful links:

| Resource | Link |
| --- | --- |
| npm package page (versions, install) | https://www.npmjs.com/package/keycloak-js |
| Keycloak docs hub (server + all guides) | https://www.keycloak.org/documentation |
| Securing Apps guide | https://www.keycloak.org/docs/latest/securing_apps/ |
| Adapter source code | https://github.com/keycloak/keycloak-js |

> 💡 The adapter guide has a **version selector** at the top — pick the version that matches your `keycloak-js` dependency (Safineh uses `^26.2.0`) for accurate docs.

---

## Step 0 — Prepare Keycloak (server side)

Before touching the code, make sure the Keycloak admin has provided you with:

| Item | Example (Safineh dev) |
| --- | --- |
| Auth server base URL | `https://dev-sts.si24.ir/` |
| Realm name | `saman-insurance` |
| Client ID | `life-web-client` |

On the Keycloak client configuration, make sure:

- **Access Type** is `confidential` or `public` (SPA usually uses `public` with PKCE).
- **Valid Redirect URIs** includes your app origin(s), e.g. `http://localhost:5173` and the deployed URL.
- **Web Origins** includes your app origin(s) (needed for CORS during login).
- **PKCE** is enforced (we use `S256` in code below).

---

## Step 1 — Install the package

```bash
npm install keycloak-js
```

Safineh currently uses:

```json
"dependencies": {
  "keycloak-js": "^26.2.0"
}
```

> Match the adapter major version with your Keycloak server version (adapter 26.x works with Keycloak 26.x).

---

## Step 2 — Define environment variables

Create / extend your `.env` files (one per environment: `.env.develop`, `.env.stage`, `.env.beta`, `.env.production`) with three variables:

```bash
# .env (local development)
VITE_KEYCLOAK_URL=https://dev-sts.si24.ir/
VITE_KEYCLOAK_REALM=saman-insurance
VITE_KEYCLOAK_CLIENT=life-web-client
```

Production example (`.env.production`):

```bash
VITE_KEYCLOAK_URL=https://sts.si24.ir/
VITE_KEYCLOAK_REALM=saman-insurance
VITE_KEYCLOAK_CLIENT=life-web-client
```

Then type them in `src/vite-env.d.ts` so `import.meta.env` is typed:

```ts
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_KEYCLOAK_URL: string;
  readonly VITE_KEYCLOAK_REALM: string;
  readonly VITE_KEYCLOAK_CLIENT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

If you use `env-cmd` per environment, your `package.json` scripts look like:

```json
"scripts": {
  "dev": "vite",
  "build:develop": "env-cmd -f .env.develop vite build",
  "build:stage": "env-cmd -f .env.stage vite build",
  "build:production": "env-cmd -f .env.production vite build"
}
```

---

## Step 3 — Add the silent SSO page to `public/`

Create `public/silent-check-sso.html` with exactly this content:

```html
<html><body><script>parent.postMessage(location.href, location.origin)</script></body></html>
```

This static page is loaded inside a hidden iframe by `keycloak-js` to check the session silently (no redirect / no flicker) when the app starts. Keycloak must serve the callback back to this page, and the page posts the result to the parent window.

> ⚠️ Keep the file clean — no extra text after `</html>` (a stray character here breaks silent SSO).
>
> Don't forget to add `{{base-url}}/silent-check-sso.html` (e.g. `http://localhost:5173/silent-check-sso.html`) to the client's **Valid Redirect URIs** in Keycloak.

---

## Step 4 — Create the AuthService

Create `src/shared/services/Auth/AuthService.tsx`. It holds a **single Keycloak instance** (module singleton) and exposes small helper functions, so the rest of the app never touches `keycloak-js` directly.

```tsx
import Keycloak from "keycloak-js";

const keycloackConfig = {
  url: import.meta.env.VITE_KEYCLOAK_URL as string,
  realm: import.meta.env.VITE_KEYCLOAK_REALM as string,
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT as string,
};

const _kc = new Keycloak(keycloackConfig);

/**
 * Initializes the Keycloak instance and calls the provided callback
 * once initialization is finished.
 */
const initKeycloak = (onAuthenticatedCallback: () => void): void => {
  _kc
    .init({
      onLoad: "check-sso",
      checkLoginIframe: true,
      silentCheckSsoRedirectUri:
        window.location.origin + "/silent-check-sso.html",
      pkceMethod: "S256",
    })
    .then((authenticated: boolean) => {
      if (!authenticated) {
        console.log("user is not authenticated..!");
        doLogin();
      }
      onAuthenticatedCallback();
    })
    .catch(console.error);
};

const doLogin = _kc.login;
const doLogout = _kc.logout;
const getToken = () => _kc.token;
const isLoggedIn = () => !!_kc.token;

const updateToken = (successCallback: any) =>
  _kc.updateToken(5).then(successCallback).catch(doLogin);

const getUsername = () => {
  return _kc.tokenParsed?.name
    ? _kc.tokenParsed?.name
    : _kc.tokenParsed?.preferred_username;
};

const getUserInfo = () => {
  return {
    id: _kc.tokenParsed?.sid,
    name: _kc.tokenParsed?.preferred_username,
  };
};

const AuthService = {
  initKeycloak,
  doLogin,
  doLogout,
  isLoggedIn,
  getToken,
  updateToken,
  getUsername,
  getUserInfo,
};

export default AuthService;
```

### Why these options?

| Option | Meaning |
| --- | --- |
| `onLoad: "check-sso"` | Check the SSO session on load without forcing a redirect. If the user has a Keycloak session, the app is authenticated silently. |
| `silentCheckSsoRedirectUri` | The hidden-iframe page from Step 3 — makes the check silent (no visible redirect). |
| `pkceMethod: "S256"` | Uses PKCE to protect the authorization code. |
| `checkLoginIframe: true` | Keycloak detects session changes (logout in another tab) via iframe polling. |
| `updateToken(5)` | Refresh the token only if it expires within 5 seconds (used by the HTTP interceptor). |

> In this repo, `onLoad: "check-sso"` is combined with `doLogin()` when `authenticated === false`, so effectively users are always sent to the login page. If you want a "login only when clicking login" app, keep `check-sso` and remove the automatic `doLogin()`.

---

## Step 5 — Bootstrap in `main.tsx` (before rendering React)

Call the init **before** mounting `<App />`, so no component renders before auth is ready:

```tsx
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import AuthService from "@shared/services/Auth/AuthService";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, staleTime: 0, gcTime: 0 },
  },
});

const renderApp = () =>
  root.render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );

AuthService.initKeycloak(renderApp);
```

---

## Step 6 — Attach the token to your HTTP client

Add an axios interceptor that refreshes the token (if it expires in < 5s) and sends `Authorization: Bearer <token>` on every request (Safineh: `src/shared/services/Httpclient.ts`):

```ts
import axios, { AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";
import AuthService from "./Auth/AuthService";

class HttpClient {
  private service = axios.create();

  constructor() {
    this.service.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        if (AuthService.isLoggedIn()) {
          // refresh token if older than 5s remaining, then continue
          return AuthService.updateToken(() => Promise.resolve(config));
        }
        return config;
      }
    );
  }

  private makeRequest<T>(method: string, url: string, data?: any, config?: AxiosRequestConfig, hasAuth = true): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (AuthService.isLoggedIn() && hasAuth) {
      headers.Authorization = `Bearer ${AuthService.getToken()}`;
    }

    return this.service.request<T, any>({ url, method, data, ...config, headers: { ...headers, ...config?.headers } });
  }

  get<T>(url: string, config?: AxiosRequestConfig, hasAuth?: boolean) {
    return this.makeRequest<T>("get", url, undefined, config, hasAuth);
  }
  post<T>(url: string, data: any, config?: AxiosRequestConfig, hasAuth?: boolean) {
    return this.makeRequest<T>("post", url, data, config, hasAuth);
  }
  // ... put / delete the same way
}

export const httpClient = new HttpClient();
```

> Pass `hasAuth = false` for endpoints that must be called without a token (public endpoints).

---

## Step 7 — Use auth anywhere in the app

Because `AuthService` is a plain module singleton, just import it:

```tsx
import AuthService from "@shared/services/Auth/AuthService";

const Header = () => {
  if (!AuthService.isLoggedIn()) return null;

  return (
    <div>
      <span>{AuthService.getUsername()}</span>
      <button onClick={() => AuthService.doLogout()}>
        Logout
      </button>
    </div>
  );
};
```

Logout with redirect back to the app:

```ts
AuthService.doLogout({ redirectUri: window.location.origin });
```

---

## Checklist (TL;DR)

- [ ] `npm install keycloak-js`
- [ ] Add `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT` to every `.env.*` file
- [ ] Type them in `src/vite-env.d.ts`
- [ ] Add `public/silent-check-sso.html`
- [ ] Register app origin + `/silent-check-sso.html` in the Keycloak client (Valid Redirect URIs / Web Origins)
- [ ] Create `src/shared/services/Auth/AuthService.tsx` (singleton, `check-sso` + PKCE)
- [ ] Call `AuthService.initKeycloak(renderApp)` in `main.tsx` before rendering
- [ ] Add token refresh + `Bearer` header interceptor to the HTTP client
- [ ] Use `AuthService.getUsername() / isLoggedIn() / doLogout()` in components

## Common issues

| Symptom | Likely cause |
| --- | --- |
| Endless redirect loop after login | `Valid Redirect URIs` on the Keycloak client doesn't include your app origin. |
| Console error about `silent-check-sso.html` | File missing in `public/`, wrong `silentCheckSsoRedirectUri`, or the URI isn't in Valid Redirect URIs. |
| `CORS` errors on login | Client's **Web Origins** doesn't include your app origin. |
| 401 on API calls after a while | Interceptor not refreshing the token, or clock skew between server and client (Keycloak default token life is 5 min). |
| Silent SSO not working, full redirect instead | Extra characters / invalid HTML inside `silent-check-sso.html`, or the iframe page blocked by `Content-Security-Policy` headers. |
