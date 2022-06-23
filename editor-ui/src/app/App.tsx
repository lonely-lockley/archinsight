import { AxiosError } from 'axios';
import { useSnackbar } from 'notistack';
import React, { FC, useEffect } from 'react';

import { CssBaseline } from '@mui/material';

import Router from './Router';
import CompileError from './components/CompileError';
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
      const { response: res } = models[model].error as AxiosError<any>;
      const message = res?.data?.message;
      const embedded = res?.data?._embedded?.errors;
      if (embedded?.length) {
        embedded.forEach((e: { message: string }) =>
          enqueueSnackbar(e.message, {
            content: (key, message) => <CompileError id={key} message={message} />,
          }),
        );
      } else if (message) {
        enqueueSnackbar(message, { variant: 'error' });
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
