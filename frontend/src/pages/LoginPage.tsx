import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import googleLogo from '@/assets/google-logo.svg';
import { AppLogo } from '@/components/brand/AppLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { getGoogleLoginConfig, login, loginWithGoogle } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth.store';
import { toast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
import type { GoogleCodeResponse } from '@/types/google-identity';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleConfig, setGoogleConfig] = useState<{
    configured: boolean;
    clientId: string | null;
  } | null>(null);
  const [googleConfigFailed, setGoogleConfigFailed] = useState(false);
  const [googleScriptReady, setGoogleScriptReady] = useState(false);
  const [googleScriptFailed, setGoogleScriptFailed] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    getGoogleLoginConfig()
      .then((config) => {
        if (active) setGoogleConfig(config);
      })
      .catch(() => {
        if (!active) return;
        setGoogleConfig({ configured: false, clientId: null });
        setGoogleConfigFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!googleConfig?.configured || !googleConfig.clientId) return;
    if (window.google?.accounts.oauth2) {
      setGoogleScriptReady(true);
      return;
    }

    const scriptId = 'google-identity-services';
    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;
    const script = existingScript ?? document.createElement('script');
    const handleLoad = () => setGoogleScriptReady(true);
    const handleError = () => setGoogleScriptFailed(true);
    script.addEventListener('load', handleLoad);
    script.addEventListener('error', handleError);
    if (!existingScript) {
      script.id = scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    return () => {
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
    };
  }, [googleConfig]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { token, user } = await login(username, password);
      setAuth(token, user);
      toast('Welcome back', `Signed in as ${user.name}`);
      navigate('/pos');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Login failed';
      toast('Login failed', msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    const clientId = googleConfig?.clientId;
    const google = window.google?.accounts.oauth2;
    if (!clientId || !googleConfig.configured || !google) {
      toast('Google sign-in is unavailable', 'Check the connection and server OAuth configuration.', 'error');
      return;
    }

    const client = google.initCodeClient({
      client_id: clientId,
      scope: 'openid email',
      ux_mode: 'popup',
      select_account: true,
      callback: (response: GoogleCodeResponse) => {
        if (response.error || !response.code) {
          toast('Google sign-in cancelled', response.error ?? 'No authorization code was returned.', 'error');
          return;
        }

        setGoogleLoading(true);
        loginWithGoogle(response.code)
          .then(({ token, user }) => {
            setAuth(token, user);
            toast('Welcome back', `Signed in as ${user.name}`);
            navigate('/pos');
          })
          .catch((error: unknown) => {
            const message = error instanceof ApiError
              ? error.message
              : error instanceof Error ? error.message : 'Google sign-in failed.';
            toast('Google sign-in failed', message, 'error');
          })
          .finally(() => setGoogleLoading(false));
      },
      error_callback: (error) => {
        toast('Google sign-in could not open', error.type, 'error');
      },
    });
    client.requestCode();
  };

  return (
    <div className="flex min-h-screen bg-[var(--color-background)]">
      <aside className="relative hidden w-[44%] min-w-[320px] flex-col justify-between overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-primary)] p-10 text-white lg:flex">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_20%_0%,_#1a73e833,_transparent_55%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_100%_100%,_#b07d1a22,_transparent_50%)]" />

        <div className="relative">
          <AppLogo size={48} rounded="xl" className="ring-1 ring-white/15" />
        </div>

        <div className="relative max-w-md space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-white/50">
            Enterprise billing
          </p>
          <h1 className="text-3xl font-medium leading-tight tracking-tight">
            Devi Times
          </h1>
          <p className="text-base leading-relaxed text-white/70">
            Point of sale, inventory, GST reporting, and invoicing in one secure workspace.
          </p>
        </div>

        <p className="relative text-xs text-white/40">© {new Date().getFullYear()} Devi Times Billing</p>
      </aside>

      <main className="flex flex-1 flex-col items-center justify-center p-6 sm:p-10">
        <div className="mb-8 w-full max-w-[400px] lg:hidden">
          <div className="flex items-center gap-3">
            <AppLogo size={44} rounded="xl" />
            <div>
              <p className="text-sm font-medium text-[var(--color-foreground)]">
                Devi Times
              </p>
              <p className="text-xs text-[var(--color-muted-foreground)]">Billing & POS</p>
            </div>
          </div>
        </div>

        <div className="w-full max-w-[400px]">
          <div className="mb-8">
            <h2 className="text-2xl font-medium tracking-tight text-[var(--color-foreground)]">
              Sign in
            </h2>
            <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
              Continue with your username and password or the authorized Google account.
            </p>
            <p className="mt-3 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] p-3 text-xs leading-relaxed text-[var(--color-muted-foreground)]">
              First sign-in requires an internet connection. After signing in once on this device, your
              session and previously loaded data are available offline. Your password is never saved
              for offline sign-in.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="surface-card space-y-5 p-6 sm:p-8"
          >
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                inputMode="numeric"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="h-10"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="h-10"
                required
              />
            </div>
            <Button
              type="submit"
              className="h-10 w-full"
              variant="accent"
              disabled={loading || googleLoading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Continue'
              )}
            </Button>
          </form>

          <div className="my-4 flex items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
            <span className="h-px flex-1 bg-[var(--color-border)]" />
            or
            <span className="h-px flex-1 bg-[var(--color-border)]" />
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full"
            onClick={handleGoogleSignIn}
            disabled={
              !googleConfig?.configured ||
              !googleScriptReady ||
              loading ||
              googleLoading
            }
          >
            {googleLoading || (
              googleConfig?.configured && !googleScriptReady
            )
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <img src={googleLogo} alt="" aria-hidden="true" className="h-4 w-4 object-contain" />}
            {googleLoading
              ? 'Signing in with Google…'
              : !googleConfig
                ? 'Checking Google sign-in…'
                : googleConfig.configured && !googleScriptReady
                  ? 'Loading Google sign-in…'
                  : 'Sign in with Google'}
          </Button>
          {(googleConfigFailed || googleScriptFailed || googleConfig?.configured === false) && (
            <p className="mt-2 text-center text-xs text-[var(--color-muted-foreground)]" role="status">
              {googleScriptFailed
                ? 'Google sign-in could not load. Check your internet connection and refresh.'
                : googleConfigFailed
                  ? 'Google sign-in configuration could not be checked. Try again online.'
                  : 'Google sign-in is not configured for this application yet.'}
            </p>
          )}

          <nav
            aria-label="Legal information"
            className="mt-8 flex justify-center gap-5 text-xs text-[var(--color-muted-foreground)]"
          >
            <a className="hover:text-[var(--color-foreground)] hover:underline" href="./privacy.html">
              Privacy Policy
            </a>
            <a className="hover:text-[var(--color-foreground)] hover:underline" href="./terms.html">
              Terms of Service
            </a>
          </nav>
        </div>
      </main>
    </div>
  );
}
