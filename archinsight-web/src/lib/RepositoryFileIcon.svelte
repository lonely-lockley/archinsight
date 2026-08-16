<script lang="ts">
  export let name: string;
  export let type: 'directory' | 'file';
  export let opened = false;

  $: icon = iconForNode(name, type, opened);

  function iconForNode(itemName: string, itemType: 'directory' | 'file', isOpened: boolean): string {
    if (itemType === 'directory') {
      return isOpened ? 'folder-opened' : 'folder';
    }
    const normalized = itemName.toLowerCase();
    const extension = normalized.includes('.') ? normalized.split('.').at(-1) : undefined;
    if (extension === 'ai') {
      return 'ai';
    }
    if (normalized === 'package.json') {
      return 'package';
    }
    if (extension === 'json') {
      return 'json';
    }
    if (['md', 'markdown'].includes(extension ?? '')) {
      return 'markdown';
    }
    if (['yml', 'yaml', 'toml', 'properties', 'conf', 'config', 'ini', 'env'].includes(extension ?? '')) {
      return 'settings';
    }
    if (['java', 'ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'svelte', 'css', 'scss', 'html', 'xml', 'g4', 'sh', 'sql'].includes(extension ?? '')) {
      return 'file-code';
    }
    return 'file';
  }
</script>

{#if icon === 'ai'}
  <svg class="tree-icon ai-file-icon" viewBox="0 0 16 16" aria-hidden="true">
    <path class="ai-file-page" d="M3.25 1.5h6.25l3.25 3.25v9.75h-9.5z" />
    <path class="ai-file-fold" d="M9.5 1.5v3.25h3.25" />
    <g class="ai-file-mark" transform="translate(4.05 5.15) scale(0.225)">
      <path d="M17.2085 0.5C20.3898 0.672099 22.5512 1.95403 23.8627 4.58295C26.2487 9.36649 28.662 14.1378 31.0385 18.9268C32.2179 21.3023 33.3796 23.6873 34.4827 26.098C36.3689 30.2189 32.858 35.6773 27.8203 35.4808C25.4506 35.3887 23.529 34.4984 22.2216 32.528C20.5192 29.9628 17.997 29.4479 15.6545 30.2067C14.8946 30.4534 14.1878 30.9995 13.5831 31.5469C12.9076 32.1581 12.4405 32.9956 11.7704 33.6148C9.82562 35.4104 7.48861 35.9185 4.99226 35.1597C2.28072 34.3358 0.61785 32.4251 0.104416 29.6349C-0.170687 28.1402 0.111226 26.6875 0.792173 25.3202C4.16967 18.5365 7.56896 11.765 10.9056 4.96238C11.8453 3.0449 13.1582 1.60035 15.2065 0.917374C15.9324 0.674809 16.7154 0.598923 17.2098 0.5L17.2085 0.5ZM2.76556 24.7131C4.64225 23.0653 6.94249 22.6113 9.15285 22.8065C13.6539 23.2035 17.4073 25.2348 20.5873 28.3231C21.8266 29.5265 22.8276 30.971 23.988 32.2597C26.1588 34.6691 30.2867 34.5011 32.237 31.8952C33.5839 30.0956 33.829 28.1104 32.8171 26.0601C29.7474 19.8401 26.6586 13.6297 23.5753 7.41649C23.514 7.29317 23.4405 7.17663 23.3057 6.93813C23.292 7.15088 23.2771 7.22541 23.2839 7.29859C23.5426 10.2609 20.6214 13.4711 16.6841 12.8085C15.3032 12.5754 13.8922 12.4223 12.4936 12.4101C10.0789 12.3897 8.27306 13.4684 7.20533 15.6786C6.48762 17.1638 5.74811 18.6395 5.0195 20.1206C4.26637 21.6506 3.51596 23.1818 2.76556 24.7118V24.7131Z" />
    </g>
  </svg>
{:else}
  <span aria-hidden="true" class={`codicon tree-icon codicon-${icon}`}></span>
{/if}

<style>
  .tree-icon {
    display: inline-grid;
    width: 16px;
    height: 16px;
    place-items: center;
    color: currentColor;
  }

  .codicon-folder::before {
    content: "\ea83";
  }

  .codicon-folder-opened::before {
    content: "\eaf7";
  }

  .codicon-file::before {
    content: "\ea7b";
  }

  .codicon-file-code::before {
    content: "\eae9";
  }

  .codicon-json::before {
    content: "\eb0f";
  }

  .codicon-markdown::before {
    content: "\eb1d";
  }

  .codicon-package::before {
    content: "\eb29";
  }

  .codicon-settings::before {
    content: "\eb52";
  }

  .ai-file-icon {
    color: var(--color-primary);
    overflow: visible;
  }

  .ai-file-mark path {
    fill: currentColor;
  }

  .ai-file-icon .ai-file-page,
  .ai-file-icon .ai-file-fold {
    fill: none;
    stroke: currentColor;
    stroke-width: 1;
    stroke-linejoin: round;
    opacity: 0.62;
  }
</style>
