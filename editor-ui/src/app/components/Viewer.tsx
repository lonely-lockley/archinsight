import { useSnackbar } from 'notistack';
import React, { ChangeEvent, FC, useCallback, useEffect, useRef, useState } from 'react';
import ResizeObserver from 'react-resize-observer';

import { useSVGMove, useUpload } from '../hooks';
import { useSelect } from '../store';
import DownloadArea from './DownloadArea';
import UploadArea from './UploadArea';

type Props = {
  width: number;
};

type FileNames = {
  upload: string;
  download: string;
};

const Viewer: FC<Props> = ({ width }) => {
  const { enqueueSnackbar } = useSnackbar();

  const { image } = useSelect((state) => state.app);
  const { isSuccess, isLoading } = useSelect((state) => state.loading);

  const container = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGElement>();

  const { onDown, onWheel, onUp, onMove } = useSVGMove(svg);
  const { upload, clearUpload } = useUpload();

  useEffect(() => {
    getAreaSize();
  }, [width]);

  const [fileName, setFileName] = useState<FileNames>({
    upload: '',
    download: '',
  });

  /** Inject SVG onto DOM (when upload button was pressed) */
  const loadFile = useCallback(
    ({ target }: ChangeEvent<HTMLInputElement>) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string' && container.current) {
          container.current.innerHTML = reader.result;
          getSVGRef();
        }
      };
      if (target?.files?.length) {
        const file = target.files[0];
        reader.readAsText(file);
        setFileName({ upload: file.name, download: '' });
      }
    },
    [container],
  );

  /** Finding SVG with saving ref  */
  const getSVGRef = useCallback(() => {
    if (!container.current) return;
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
    } else getAreaSize();
  }, [container]);

  /** Resizing SVG for Viewer area */
  const getAreaSize = useCallback(() => {
    if (!container.current || !svg.current) return;
    const w = container.current.clientWidth;
    const h = container.current.clientHeight;
    svg.current.setAttribute('width', `${w - 5}px`);
    svg.current.setAttribute('height', `${h - 5}px`);
  }, [container]);

  /** Watch render changing */
  useEffect(() => {
    if (!image || !container.current) return;
    clearUpload();
    setFileName({ upload: '', download: `temp-${Date.now()}.svg` });
    container.current.innerHTML = image;
    getSVGRef();
  }, [isSuccess.getRender]);

  const downloadFile = useCallback(() => {
    if (!container.current) return;
    const element = document.createElement('a');
    const file = new Blob([container.current.innerHTML], { type: 'image/svg' });
    element.href = URL.createObjectURL(file);
    element.download = fileName.download + '.svg';
    document.body.appendChild(element);
    element.click();
  }, [container, fileName.download]);

  return (
    <>
      <UploadArea fileName={fileName.upload} upload={upload} onLoad={loadFile} />

      <div style={{ position: 'absolute', bottom: '5px', right: '5px' }}>
        <DownloadArea
          fileName={fileName.download}
          onDownload={downloadFile}
          loading={isLoading.getRender || false}
        />
      </div>

      <ResizeObserver onResize={getAreaSize} />
      <div
        style={{ height: '90%', overflow: 'hidden' }}
        ref={container}
        onWheel={onWheel}
        onMouseDown={onDown}
        onMouseUp={onUp}
        onMouseMove={onMove}
      />
    </>
  );
};

export default Viewer;
