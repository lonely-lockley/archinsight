<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { AuthUserResponse } from './api';

  export let user: AuthUserResponse = { authenticated: false };
  export let onLogin: () => void;
  export let onManageProjects: () => void;
  export let onSettings: () => void;
  export let onLogout: () => void;

  let open = false;

  onMount(() => {
    window.addEventListener('click', close);
  });

  onDestroy(() => {
    window.removeEventListener('click', close);
  });

  function close(): void {
    open = false;
  }

  function toggle(event: MouseEvent): void {
    event.stopPropagation();
    open = !open;
  }

  function userInitials(): string {
    const name = user.displayName ?? user.email ?? '';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return '?';
    }
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  function displayUserName(): string {
    return user.displayName ?? user.email ?? 'Signed in';
  }

  function selectSettings(): void {
    close();
    onSettings();
  }

  function selectManageProjects(): void {
    close();
    onManageProjects();
  }

  function selectLogout(): void {
    close();
    onLogout();
  }
</script>

<div class="auth-menu">
  {#if user.authenticated}
    <button
      aria-label="Account"
      class="avatar-button has-tooltip"
      data-tooltip={user.displayName ?? user.email ?? 'Account'}
      type="button"
      on:click={toggle}
    >
      {#if user.avatar}
        <img alt="" src={user.avatar} />
      {:else}
        <span>{userInitials()}</span>
      {/if}
    </button>
    {#if open}
      <div class="auth-dropdown" role="menu">
        <div class="auth-user-name" aria-label="Signed in as">{displayUserName()}</div>
        <button type="button" role="menuitem" on:click={selectManageProjects}>
          <span aria-hidden="true" class="codicon codicon-folder-library"></span>
          <span>Manage Projects</span>
        </button>
        <button type="button" role="menuitem" on:click={selectSettings}>
          <span aria-hidden="true" class="codicon codicon-settings-gear"></span>
          <span>Settings</span>
        </button>
        <button type="button" role="menuitem" on:click={selectLogout}>
          <span aria-hidden="true" class="codicon codicon-sign-out"></span>
          <span>Logout</span>
        </button>
      </div>
    {/if}
  {:else}
    <button aria-label="Login" class="login-button has-tooltip" data-tooltip="Login" type="button" on:click={onLogin}>
      <span aria-hidden="true" class="codicon codicon-account"></span>
    </button>
  {/if}
</div>

<style>
  .auth-menu {
    position: relative;
    display: inline-grid;
    place-items: center;
  }

  .login-button,
  .avatar-button {
    display: inline-grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid #3a3a3a;
    border-radius: 4px;
    background: #2a2a2a;
    color: #eeeeee;
    font-size: 16px;
    line-height: 1;
  }

  .login-button:hover,
  .avatar-button:hover {
    background: #343434;
  }

  .avatar-button {
    overflow: hidden;
    border-radius: 50%;
    font-size: 11px;
    font-weight: 600;
  }

  .avatar-button img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .auth-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 50;
    min-width: 180px;
    padding: 4px;
    border: 1px solid #3a3a3a;
    border-radius: 4px;
    background: #242424;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
  }

  .auth-user-name {
    max-width: 240px;
    padding: 7px 8px 8px;
    border-bottom: 1px solid #343434;
    color: #eeeeee;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.25;
    overflow: hidden;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .auth-dropdown button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 28px;
    padding: 0 8px;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: #eeeeee;
    font-size: 12px;
    text-align: left;
  }

  .auth-dropdown button:hover {
    background: #343434;
  }

  .has-tooltip {
    position: relative;
  }

  .has-tooltip::after {
    position: absolute;
    top: calc(100% + 8px);
    left: 50%;
    z-index: 60;
    max-width: 220px;
    padding: 6px 8px;
    border: 1px solid #444444;
    border-radius: 4px;
    background: #181818;
    color: #eeeeee;
    content: attr(data-tooltip);
    font-size: 12px;
    font-weight: 500;
    line-height: 1.25;
    opacity: 0;
    pointer-events: none;
    text-align: center;
    transform: translate(-50%, -2px);
    transition: opacity 120ms ease, transform 120ms ease;
    transition-delay: 0ms;
    white-space: nowrap;
  }

  .has-tooltip:hover::after,
  .has-tooltip:focus-visible::after {
    opacity: 1;
    transform: translate(-50%, 0);
    transition-delay: 300ms;
  }
</style>
