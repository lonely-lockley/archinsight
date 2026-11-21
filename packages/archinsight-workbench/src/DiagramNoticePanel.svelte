<script lang="ts">
  import type { DiagramNotice } from '@archinsight/contracts';

  export let notice: DiagramNotice;
</script>

<section class="diagram-notice" data-kind={notice.kind} role="status">
  <strong>{notice.title}</strong>
  <p>{notice.detail}</p>
</section>

<style>
  .diagram-notice {
    display: grid;
    align-content: center;
    justify-items: center;
    width: min(420px, calc(100% - 48px));
    min-height: 180px;
    margin: auto;
    color: var(--archinsight-foreground, CanvasText);
    text-align: center;
  }

  strong {
    font-size: 15px;
    font-weight: 600;
    line-height: 1.4;
  }

  p {
    max-width: 380px;
    margin: 7px 0 0;
    color: var(--archinsight-muted, #a8a8a8);
    font-size: 13px;
    line-height: 1.5;
  }
</style>
