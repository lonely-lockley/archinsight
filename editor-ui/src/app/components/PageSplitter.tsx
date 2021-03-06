import React, { memo, useCallback, useMemo, useRef } from 'react';
import Draggable, { DraggableEvent } from 'react-draggable';

type Props = {
  width: number;
  update: (v: number) => void;
};

const PageSplitter = memo(({ width, update }: Props) => {
  const nodeRef = useRef<HTMLDivElement>(null);

  const LIMIT = useMemo(() => 30, []);

  const calc = useMemo(
    () => ({
      left: -window.innerWidth * (width / 100) + LIMIT,
      right: ((window.innerWidth - LIMIT) * (100 - width)) / 100,
    }),
    [LIMIT, width],
  );

  const onDrag = useCallback(
    (event: DraggableEvent) => {
      if (!('clientX' in event)) return;
      if (event.clientX < LIMIT || event.clientX > window.innerWidth - LIMIT) return;

      update((event.clientX / window.innerWidth) * 100);
    },
    [LIMIT],
  );

  return (
    <Draggable
      axis='x'
      nodeRef={nodeRef}
      bounds={{ left: calc.left, right: calc.right }}
      onDrag={(e) => onDrag(e)}
      scale={10000}
    >
      <div ref={nodeRef} style={{ cursor: 'e-resize', width: 3, background: '#1e1e1e' }} />
    </Draggable>
  );
});

export default PageSplitter;
