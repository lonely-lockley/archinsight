import { useSnackbar } from 'notistack';
import React, { FC, useEffect } from 'react';

import { useDispatch, useSelect } from '../store';
import CompileError from './CompileError';

const NotificationsBroker: FC = () => {
  const { enqueueSnackbar } = useSnackbar();
  const { common, compile } = useSelect((state) => state.notify);
  const { ask } = useDispatch((state) => state.notify);

  useEffect(() => {
    common.forEach((msg) => {
      enqueueSnackbar(msg, { variant: 'error' });
      ask('common');
    });
  }, [common]);

  useEffect(() => {
    compile.forEach((msg) => {
      enqueueSnackbar(msg, {
        content: (key, message) => <CompileError id={key} message={message} />,
      });
      ask('compile');
    });
  }, [compile]);

  return <></>;
};

export default NotificationsBroker;
