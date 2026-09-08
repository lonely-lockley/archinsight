// @vitest-environment happy-dom

import { mount, unmount } from 'svelte';
import { describe, expect, it } from 'vitest';
import RepositoryFileIcon from './RepositoryFileIcon.svelte';

describe('RepositoryFileIcon', () => {
  it('uses distinct project-style icons for Insight models and queries', async () => {
    const target = document.createElement('div');
    document.body.append(target);

    const query = mount(RepositoryFileIcon, {
      target,
      props: { name: 'impact.aiq', type: 'file' }
    });
    expect(target.querySelector('.aiq-file-icon')).not.toBeNull();
    expect(target.querySelectorAll('.query-file-node')).toHaveLength(3);
    await unmount(query);

    const model = mount(RepositoryFileIcon, {
      target,
      props: { name: 'model.ai', type: 'file' }
    });
    expect(target.querySelector('.ai-file-icon')).not.toBeNull();
    expect(target.querySelector('.aiq-file-icon')).toBeNull();
    await unmount(model);
    target.remove();
  });
});
