import { mount, unmount } from 'svelte';
import TechnologyIconPicker from './TechnologyIconPicker.svelte';

export function openTechnologyIconPicker(initialQuery = ''): Promise<string | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | undefined): void => {
      if (settled) return;
      settled = true;
      void unmount(component).finally(() => {
        target.remove();
        resolve(value);
      });
    };
    const target = document.createElement('div');
    document.body.append(target);
    const component = mount(TechnologyIconPicker, {
      target,
      props: {
        initialQuery,
        onSelect: (iconId: string) => finish(iconId),
        onClose: () => finish(undefined),
      },
    });
  });
}
