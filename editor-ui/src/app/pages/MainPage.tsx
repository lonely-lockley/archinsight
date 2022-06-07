import React, { FC, useMemo, useState } from 'react';

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
