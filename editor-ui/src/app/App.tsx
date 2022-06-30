import React, { FC } from 'react';

import { CssBaseline } from '@mui/material';

import Router from './Router';
import NotificationsBroker from './components/NotificationsBroker';

const App: FC = () => {
  return (
    <>
      <NotificationsBroker />
      <CssBaseline />
      <Router />
    </>
  );
};

export default App;
