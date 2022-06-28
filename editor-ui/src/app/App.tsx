import React, { FC, useEffect } from 'react';

import { CssBaseline } from '@mui/material';

import Router from './Router';
import NotificationsBroker from './components/NotificationsBroker';
import { useDispatch } from './store';

const App: FC = () => {
  const { loadAPI } = useDispatch((state) => state.app);

  useEffect(() => {
    loadAPI();
  }, []);

  return (
    <>
      <NotificationsBroker />
      <CssBaseline />
      <Router />
    </>
  );
};

export default App;
