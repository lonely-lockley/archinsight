import { AxiosError } from 'axios';
import { useSnackbar } from 'notistack';
import React, { FC, useEffect } from 'react';

import { CssBaseline } from '@mui/material';

import Router from './Router';
import { useDispatch, useSelect } from './store';

const App: FC = () => {
  const { loadAPI } = useDispatch((state) => state.app);
  const { models } = useSelect((state) => state.loading);
  const { enqueueSnackbar } = useSnackbar();

  useEffect(() => {
    loadAPI();
  }, []);

  useEffect(() => {
    Object.keys(models).forEach((model) => {
      const err = models[model].error as AxiosError;
      if (err?.message) {
        enqueueSnackbar(err.message, { variant: 'error' });
      }
    });
  }, [models]);

  return (
    <>
      <CssBaseline />
      <Router />
    </>
  );
};

export default App;
