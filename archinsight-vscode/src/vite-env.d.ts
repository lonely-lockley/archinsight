declare module '*.svelte' {
  import type { ComponentType } from 'svelte';

  const component: ComponentType;
  export default component;
}

declare module '*?worker' {
  const worker: {
    new (): Worker;
  };
  export default worker;
}
