<script lang="ts">
  import type { RenderTheme } from '@insight/language';

  export let theme: RenderTheme;
</script>

<div class="workspace-theme" data-render-theme={theme}>
  <slot></slot>
</div>

<style>
  .workspace-theme {
    width: 100vw;
    height: 100vh;
    color: var(--archinsight-foreground);
    background: var(--archinsight-panel-bg);
  }

  .workspace-theme[data-render-theme='dark'] {
    color-scheme: dark;
    --color-primary: #36d074;
    --archinsight-primary-foreground: #121212;
    --archinsight-primary-hover-bg: #4be08a;
    --archinsight-foreground: #eeeeee;
    --archinsight-muted: #a8a8a8;
    --archinsight-muted-foreground: #8f8f8f;
    --archinsight-disabled-foreground: #666666;
    --archinsight-panel-bg: #252525;
    --archinsight-sidebar-bg: #212121;
    --archinsight-toolbar-bg: #242424;
    --archinsight-input-bg: #1f1f1f;
    --archinsight-control-group-bg: #202020;
    --archinsight-control-bg: #2a2a2a;
    --archinsight-control-hover-bg: #343434;
    --archinsight-control-active-bg: #354436;
    --archinsight-control-active-fg: #ffffff;
    --archinsight-border: #3a3a3a;
    --archinsight-border-subtle: #303030;
    --archinsight-border-strong: #484848;
    --archinsight-tab-strip-bg: #2b2b2b;
    --archinsight-tab-bg: #2d2d2d;
    --archinsight-tab-active-bg: #303030;
    --archinsight-preview-bg: #2e2e2e;
    --archinsight-tooltip-bg: #181818;
    --archinsight-tooltip-fg: #eeeeee;
    --archinsight-tooltip-border: #444444;
    --archinsight-menu-bg: #202020;
    --archinsight-dialog-bg: #252525;
    --archinsight-overlay-bg: rgb(0 0 0 / 38%);
    --archinsight-shadow: 0 12px 28px rgb(0 0 0 / 34%);
    --archinsight-dialog-shadow: 0 18px 50px rgb(0 0 0 / 45%);
    --archinsight-selection-overlay: rgb(255 255 255 / 8%);
    --archinsight-resize-bg: #262626;
    --archinsight-resize-hover-bg: var(--color-primary);
    --archinsight-danger: #ff8787;
    --archinsight-danger-border: #8c4848;
    --archinsight-danger-bg: #6d3333;
    --archinsight-warning: #ffb86c;
    --archinsight-info: #6fa8dc;
    --archinsight-badge-blue-border: #557b9d;
    --archinsight-badge-blue-bg: #263847;
    --archinsight-badge-blue-fg: #9dccf3;
    --archinsight-focus: #80b8ee;
    --archinsight-hint-bg: #2b3440;
    --archinsight-hint-fg: #abb6c7;
    --archinsight-symbol-class: #ee9d28;
    --archinsight-symbol-variable: #75beff;
  }

  .workspace-theme[data-render-theme='light'] {
    color-scheme: light;
    --color-primary: #247f49;
    --archinsight-primary-foreground: #ffffff;
    --archinsight-primary-hover-bg: #1d6f40;
    --archinsight-foreground: #242424;
    --archinsight-muted: #606060;
    --archinsight-muted-foreground: #737373;
    --archinsight-disabled-foreground: #9a9a9a;
    --archinsight-panel-bg: #f7f7f7;
    --archinsight-sidebar-bg: #f1f1f1;
    --archinsight-toolbar-bg: #f3f3f3;
    --archinsight-input-bg: #ffffff;
    --archinsight-control-group-bg: #e3e3e3;
    --archinsight-control-bg: #ededed;
    --archinsight-control-hover-bg: #dddddd;
    --archinsight-control-active-bg: #dcefd2;
    --archinsight-control-active-fg: #18320f;
    --archinsight-border: #d0d0d0;
    --archinsight-border-subtle: #dedede;
    --archinsight-border-strong: #b8b8b8;
    --archinsight-tab-strip-bg: #e9e9e9;
    --archinsight-tab-bg: #f0f0f0;
    --archinsight-tab-active-bg: #ffffff;
    --archinsight-preview-bg: #f4f4f4;
    --archinsight-tooltip-bg: #242424;
    --archinsight-tooltip-fg: #ffffff;
    --archinsight-tooltip-border: #4f4f4f;
    --archinsight-menu-bg: #ffffff;
    --archinsight-dialog-bg: #ffffff;
    --archinsight-overlay-bg: rgb(0 0 0 / 24%);
    --archinsight-shadow: 0 12px 28px rgb(0 0 0 / 18%);
    --archinsight-dialog-shadow: 0 18px 50px rgb(0 0 0 / 22%);
    --archinsight-selection-overlay: rgb(0 0 0 / 7%);
    --archinsight-resize-bg: #e7e7e7;
    --archinsight-resize-hover-bg: #4d8f2d;
    --archinsight-danger: #b42318;
    --archinsight-danger-border: #d92d20;
    --archinsight-danger-bg: #fee4e2;
    --archinsight-warning: #9a6700;
    --archinsight-info: #0969da;
    --archinsight-badge-blue-border: #6e9fc8;
    --archinsight-badge-blue-bg: #e3f2fd;
    --archinsight-badge-blue-fg: #175b8f;
    --archinsight-focus: #0969da;
    --archinsight-hint-bg: #e7edf5;
    --archinsight-hint-fg: #4f5f73;
    --archinsight-symbol-class: #9a4f00;
    --archinsight-symbol-variable: #0969da;
  }
</style>
