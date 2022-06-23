import { SnackbarContent, SnackbarKey, SnackbarMessage } from 'notistack';
import React, { FC, forwardRef, useMemo } from 'react';

import { Card, CardActions, Typography } from '@mui/material';

type Props = {
  id: SnackbarKey;
  message: SnackbarMessage;
};

const CompileError = forwardRef<HTMLDivElement, Props>((props, ref) => {
  const Text: FC<{ message: string }> = ({ message }) => {
    const messages = useMemo(() => {
      const re = /[\w\s]+:\s([\w\s]+)\[(kind=\w+,\sline=\d+),\smessage=(.*)]/;
      const [_, ...payload] = message.match(re) || [null, null];
      return _ ? payload : null;
    }, [message]);

    return (
      <>
        {messages ? (
          <>
            {messages.map((m, i) => (
              <div key={i}>{m}</div>
            ))}
          </>
        ) : (
          'Unable to get message'
        )}
      </>
    );
  };

  return (
    <SnackbarContent ref={ref}>
      <Card sx={{ backgroundColor: '#d32f2f', p: 1, color: 'white' }}>
        <CardActions>
          <Typography variant={'subtitle2'}>
            {typeof props.message === 'string' ? <Text message={props.message} /> : props.message}
          </Typography>
        </CardActions>
      </Card>
    </SnackbarContent>
  );
});

export default CompileError;
