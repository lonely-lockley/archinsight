<script lang="ts">
  import type { MessageView } from './workspace-types';

  export let messages: MessageView[] = [];
  export let hidden = false;
  export let panel: HTMLElement;

  function messageClass(message: MessageView): string {
    return message.level === 'ERROR'
      ? 'error'
      : message.level === 'WARNING'
        ? 'warning'
        : 'note';
  }

  function formatMessageTime(time: number): string {
    return new Date(time).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
</script>

<section bind:this={panel} class:hidden-panel={hidden} class="messages-panel" aria-label="Parser and linker messages">
  {#if messages.length === 0}
    <div class="messages-empty">No parser or linker messages</div>
  {:else}
    {#each messages as message (message.id)}
      <div class:msg-error={messageClass(message) === 'error'} class:msg-warning={messageClass(message) === 'warning'} class:msg-note={messageClass(message) === 'note'} class="message-row">
        <span class="message-time">{message.time === undefined ? '-' : formatMessageTime(message.time)}</span>
        <span class="message-level">{message.level}</span>
        <span class="message-source" title={message.source ?? '-'}>{message.source ?? '-'}</span>
        <span class="message-position">{message.position ?? '-'}</span>
        <span class="message-text">{message.message}</span>
      </div>
    {/each}
  {/if}
</section>

<style>
  .messages-panel {
    position: relative;
    z-index: 4;
    min-height: 0;
    overflow: auto;
    border-top: 1px solid #333333;
    background: #242424;
  }

  .messages-panel.hidden-panel {
    height: 0;
    border: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .message-row {
    display: grid;
    grid-template-columns: 82px 72px minmax(140px, 240px) 72px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    min-height: 28px;
    padding: 0 12px;
    border-left: 3px solid #6fa8dc;
    color: #d9d9d9;
    font-size: 12px;
  }

  .message-row + .message-row {
    border-top: 1px solid #303030;
  }

  .msg-error {
    border-left-color: #ff5c57;
  }

  .msg-warning {
    border-left-color: #ffb86c;
  }

  .msg-note {
    border-left-color: #6fa8dc;
  }

  .message-level {
    font-weight: 700;
  }

  .message-time,
  .message-source,
  .message-position {
    color: #a8a8a8;
    font-family: Menlo, Monaco, Consolas, monospace;
  }

  .message-source {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .message-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .messages-empty {
    padding: 16px;
    color: #8f8f8f;
    font-size: 13px;
  }
</style>
