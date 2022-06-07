import { useSnackbar } from 'notistack';
import React, { ChangeEvent, FC, useCallback, useEffect, useRef, useState } from 'react';
import ResizeObserver from 'react-resize-observer';

import SaveIcon from '@mui/icons-material/Save';
import { Fab, Input } from '@mui/material';

type Props = {
  width: number;
};

const Viewer: FC<Props> = ({ width }) => {
  const { enqueueSnackbar } = useSnackbar();

  const container = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGElement>();

  const [svgLoaded, setSVGLoaded] = useState(false);
  const [scale, setScale] = useState(1);
  const [isDraw, setIsDraw] = useState(false);

  const loadFile = useCallback(({ target }: ChangeEvent<HTMLInputElement>) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && container.current) {
        container.current.innerHTML = reader.result;
        setSVGLoaded(true);
      }
    };
    if (target?.files?.length) reader.readAsText(target.files[0]);
  }, []);

  useEffect(() => {
    getAreaSize();
  }, [width]);

  useEffect(() => {
    if (!svgLoaded || !container.current) return;
    const nodes = container.current.childNodes;
    let svgElement = false;

    nodes.forEach((node) => {
      if (node.nodeName === 'svg') {
        svg.current = node as SVGElement;
        svgElement = true;
      }
    });

    if (!svgElement) {
      enqueueSnackbar('No SVG was found', { variant: 'error' });
      setSVGLoaded(false);
      return;
    }

    getAreaSize();
  }, [svgLoaded]);

  const getAreaSize = useCallback(() => {
    if (!container.current) return;
    const w = container.current.clientWidth;
    const h = container.current.clientHeight;
    setSvgView(w, h);
  }, []);

  const setSvgView = useCallback((w: number, h: number) => {
    if (!svg.current) return;
    svg.current.setAttribute('width', `${w - 5}px`);
    svg.current.setAttribute('height', `${h - 5}px`);
  }, []);

  const onWheel = useCallback(
    ({ deltaY }: React.WheelEvent<HTMLDivElement>) => {
      if (!svg.current) return;
      deltaY < 0
        ? (() => {
            const c = scale + 0.5;
            setScale(c);
            svg.current.setAttribute('transform', `scale(${c})`);
          })()
        : (() => {
            const c = scale - 0.5;
            if (c <= 0) return;
            setScale(c);
            svg.current.setAttribute('transform', `scale(${scale})`);
          })();
    },
    [scale],
  );

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

      const viewBox = svg.current?.getAttribute('viewBox');
      if (!viewBox) return;
      const [x, y, w, h] = viewBox.split(' ').map((a) => Number(a));

      svg.current.setAttribute(
        'viewBox',
        `${x - event.movementX} ${y - event.movementY} ${w} ${h}`,
      );
    },
    [isDraw],
  );

  return (
    <>
      <Input type='file' onChange={loadFile} />
      <Fab color='primary' disabled sx={{ position: 'absolute', bottom: '5px', right: '5px' }}>
        <SaveIcon />
      </Fab>
      <ResizeObserver onResize={getAreaSize} />
      <div
        style={{ height: '95%', overflow: 'hidden' }}
        ref={container}
        onWheel={(e) => onWheel(e)}
        onMouseDown={onDown}
        onMouseUp={onUp}
        onMouseMove={onMove}
      />
    </>
  );
};

export default Viewer;
