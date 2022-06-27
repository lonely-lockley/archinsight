import { createModel } from '@rematch/core';
import { AxiosError } from 'axios';

import { RootModel } from '../index';

type NotifyState = {
  common: string[];
  compile: string[];
};

export const notify = createModel<RootModel>()({
  state: {
    common: [],
    compile: [],
  } as NotifyState,

  reducers: {
    pushCommon: (state: NotifyState, message: string) => {
      state.common.push(message);
    },
    pushCompile: (state: NotifyState, message: string) => {
      state.compile.push(message);
    },
    ask: (state: NotifyState, log: 'common' | 'compile') => {
      if (log === 'common') state.common.shift();
      else state.compile.shift();
    },
  },

  effects: (dispatch) => ({
    pushError: (error: AxiosError<any>) => {
      const { response: res } = error;
      const message = res?.data?.message;
      const embedded = res?.data?._embedded?.errors;
      if (embedded?.length) {
        embedded.forEach((e: { message: string }) => dispatch.notify.pushCompile(e.message));
      } else if (message) {
        dispatch.notify.pushCommon(message);
      } else if (error?.message) {
        dispatch.notify.pushCommon(error.message);
      }
    },
  }),
});
