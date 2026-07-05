<script lang="ts">
  import { onMount } from 'svelte';
  import 'monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css';
  import { fetchCurrentUser, routePath, type AuthUserResponse } from '$lib/api';

  let user: AuthUserResponse = { authenticated: false };
  let loading = true;
  let error: string | undefined;
  let returnTo = routePath('/editor');
  let hasExplicitReturnTo = false;

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    hasExplicitReturnTo = params.has('returnTo');
    returnTo = safeReturnTo(params.get('returnTo'));
    try {
      user = await fetchCurrentUser();
      const options = normalizedLoginOptions(user);
      if (user.authenticated && (hasExplicitReturnTo || options.length === 0)) {
        window.location.replace(returnTo);
        return;
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    } finally {
      loading = false;
    }
  });

  $: loginOptions = normalizedLoginOptions(user);

  function login(url: string): void {
    if (url.length === 0) {
      error = 'Login is not configured';
      return;
    }
    window.location.href = loginUrlWithReturnTo(url);
  }

  function safeReturnTo(value: string | null): string {
    if (value === null || value.length === 0) {
      return routePath('/editor');
    }
    if (!value.startsWith('/')) {
      return routePath('/editor');
    }
    if (value.startsWith('//')) {
      return routePath('/editor');
    }
    return value;
  }

  function normalizedLoginOptions(user: AuthUserResponse): Array<{ id: string; label: string; url: string }> {
    if (user.loginOptions !== undefined && user.loginOptions !== null && user.loginOptions.length > 0) {
      return user.loginOptions.filter((option) => option.url.length > 0);
    }
    if (user.loginUrl !== undefined && user.loginUrl !== null && user.loginUrl.length > 0) {
      return [{ id: 'default', label: 'Sign in', url: user.loginUrl }];
    }
    return [];
  }

  function loginUrlWithReturnTo(value: string): string {
    const url = new URL(value, window.location.origin);
    url.searchParams.set('returnTo', returnTo);
    return url.toString();
  }
</script>

<main class="login-page">
  <section class="login-panel" aria-label="Login">
    <img alt="" class="logo" src={routePath('/archinsight-logo-no-background.svg')} />
    <h1>Sign in to Archinsight</h1>
    {#if loading}
      <div class="status">Loading...</div>
    {:else}
      <div class="login-actions">
        {#each loginOptions as option (option.id)}
          <button class="login-action" type="button" on:click={() => login(option.url)}>
            <span aria-hidden="true" class="codicon codicon-account"></span>
            <span>{option.label}</span>
          </button>
        {/each}
      </div>
      {#if loginOptions.length === 0}
        <div class="status">No sign in providers are configured.</div>
      {/if}
      {#if error !== undefined}
        <div class="error">{error}</div>
      {/if}
    {/if}
  </section>
</main>

<style>
  .login-page {
    display: grid;
    min-height: 100vh;
    place-items: center;
    padding: 32px;
    background: #1f1f1f;
    color: #eeeeee;
  }

  .login-panel {
    display: grid;
    justify-items: center;
    width: min(360px, 100%);
    padding: 32px;
    border: 1px solid #3a3a3a;
    border-radius: 8px;
    background: #242424;
    text-align: center;
    box-shadow: 0 18px 42px rgb(0 0 0 / 32%);
  }

  .logo {
    width: 54px;
    height: 54px;
    margin-bottom: 18px;
  }

  h1 {
    margin: 0;
    font-family: var(--app-primary-font-family);
    font-size: 22px;
    font-weight: 500;
    letter-spacing: 0;
  }

  .login-actions {
    display: grid;
    gap: 8px;
    width: 100%;
    margin-top: 22px;
  }

  .login-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    height: 34px;
    padding: 0 16px;
    border: 1px solid var(--color-primary);
    border-radius: 4px;
    background: var(--color-primary);
    color: #101010;
    font-size: 13px;
    font-weight: 500;
  }

  .login-action:hover {
    filter: brightness(1.08);
  }

  .status,
  .error {
    min-height: 20px;
    font-size: 12px;
  }

  .status {
    color: #b8b8b8;
  }

  .error {
    margin-top: 14px;
    color: #ff8a80;
  }
</style>
