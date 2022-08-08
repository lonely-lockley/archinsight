import React, { MutableRefObject, useCallback, useState } from 'react';

type MoveEvent = {
  x1: number;
  y1: number;
};

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
      if (!isDraw) return;
      event.preventDefault();
      setViewBox({ x1: event.movementX, y1: event.movementY });
    },
    [isDraw],
  );

  const onWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      const native = event.nativeEvent as any;
      const wdY = native?.wheelDeltaY || 0;
      if (Math.abs(wdY) % 120 === 0 && wdY) {
        const factor = event.deltaY % 1 === 0 ? 0.5 : Math.abs(event.deltaY) / 10;
        let newScale = event.deltaY < 0 ? scale + factor : scale - factor;
        if (newScale < 1.0) newScale = 1.0;
        setTransform(newScale);
        return;
      }
      setViewBox({ x1: -native.deltaX, y1: -native.deltaY });
    },
    [scale],
  );

  const setViewBox = useCallback(
    ({ x1, y1 }: MoveEvent) => {
      if (!svg.current) return;
      const viewBox = svg.current.getAttribute('viewBox');
      if (!viewBox) return;

      const [x, y, w, h] = viewBox.split(' ').map((a) => Number(a));
      const [newX, newY] = [x - x1, y - y1];
      if (newX < -w * 0.8 || newX > w * 0.8 || newY < -h * 0.8 || newY > h * 0.8) return;
      svg.current.setAttribute('viewBox', `${newX} ${newY} ${w} ${h}`);
    },
    [svg],
  );

  const setTransform = useCallback(
    (newScale: number) => {
      if (!svg.current) return;
      svg.current.setAttribute('transform', `scale(${newScale})`);
      setScale(newScale);
    },
    [svg],
  );

  return { onDown, onUp, onMove, onWheel };
};
