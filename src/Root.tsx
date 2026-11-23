import { useState } from 'react';
import { App } from './App';
import { LoginScreen } from './components/LoginScreen';
import { newDevUserId } from './lib/ids';
import { readStorage, writeStorage } from './lib/storage';

// Same key and shape App uses (src/App.tsx: USER_KEY / IDENTITY_PATTERN).
const USER_KEY = 'saman.user';
const IDENTITY_PATTERN = /^[A-Za-z0-9._:@-]{1,128}$/;

/** The identity saved by an earlier visit, or null when there is none. */
function savedIdentity(): string | null {
  const stored = readStorage(USER_KEY)?.trim() ?? '';
  return IDENTITY_PATTERN.test(stored) ? stored : null;
}

/**
 * Entry gate: every page load starts on the login screen.
 * Signing in as a guest keeps (or creates) the browser identity and then
 * mounts the chat. The Keycloak redirect is wired through LoginScreen's

 */
export function Root() {
  const [entered, setEntered] = useState(false);

  if (!entered) {
    return (
      <LoginScreen
        onGuest={() => {
          writeStorage(USER_KEY, savedIdentity() ?? newDevUserId());
          setEntered(true);
        }}
      />
    );
  }

  return <App />;
}
