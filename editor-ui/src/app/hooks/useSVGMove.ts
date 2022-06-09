import React, { MutableRefObject, useCallback, useState } from 'react';

/** SVG moving and scaling */
export const useSVGMove = (svg: MutableRefObject<SVGElement | undefined>) => {
  const [scale, setScale] = useState(1);
  const [isDraw, setIsDraw] = useState(false);

  const onDown = useCallback(() => {
    setIsDraw(true);
  }, []);

  const onUp = useCallback(() => {
    setIsDraw(false);
  }, []);

  const onMove = useCallback(
    (event: React.MouseEvent) => {
      if (!isDraw || !svg.current) return;
      event.stopPropagation();
      event.preventDefault();

      const viewBox = svg.current.getAttribute('viewBox');
      if (!viewBox) return;

      const [x, y, w, h] = viewBox.split(' ').map((a) => Number(a));
      svg.current.setAttribute(
        'viewBox',
        `${x - event.movementX} ${y - event.movementY} ${w} ${h}`,
      );
    },
    [isDraw, svg],
  );

  const onWheel = useCallback(
    ({ deltaY }: React.WheelEvent<HTMLDivElement>) => {
      if (!svg.current) return;

      const newScale = deltaY < 0 ? scale + 0.5 : scale - 0.5;
      if (newScale <= 0.5) return;

      svg.current.setAttribute('transform', `scale(${newScale})`);
      setScale(newScale);
    },
    [scale, svg],
  );

  return { onDown, onUp, onMove, onWheel };
};
