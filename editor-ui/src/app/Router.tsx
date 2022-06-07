import React, { FC } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { LinearProgress } from '@mui/material';

import { path } from './common';

const MainPage = React.lazy(() => import('./pages/MainPage'));

const Router: FC = () => {
  return (
    <BrowserRouter>
      <React.Suspense fallback={<LinearProgress />}>
        <Routes>
          <Route path={path.ROOT} element={<MainPage />} />
        </Routes>
      </React.Suspense>
    </BrowserRouter>
  );
};

export default Router;
