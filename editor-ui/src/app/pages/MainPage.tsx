import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';

import { Box } from '@mui/material';

import Editor from '../components/Editor';
import PageSplitter from '../components/PageSplitter';
import Viewer from '../components/Viewer';

const MainPage: FC = () => {
  const [baseWidth, setBaseWidth] = useState<number>(35);

  const width = useMemo<{ left: string; right: string }>(
    () => ({
      left: `${baseWidth}%`,
      right: `${100 - baseWidth}%`,
    }),
    [baseWidth],
  );

  const scalingPrevent = useCallback((event: Event) => {
    event.preventDefault();
  }, []);

  useEffect(() => {
    window.addEventListener('wheel', (event) => scalingPrevent(event), { passive: false });
    return () => {
      window.removeEventListener('wheel', (event) => scalingPrevent(event));
    };
  }, []);

  return (
    <Box sx={{ height: '100vh', display: 'flex' }}>
      <Box sx={{ width: width.left }}>
        <Editor />
      </Box>

      <PageSplitter width={baseWidth} update={setBaseWidth} />

      <Box sx={{ width: width.right, padding: '5px' }}>
        <Viewer width={baseWidth} />
      </Box>
    </Box>
  );
};

export default MainPage;
