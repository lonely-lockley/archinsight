import { createModel } from '@rematch/core';
import { AxiosError } from 'axios';

import { RootModel } from '../index';

type NotifyState = {
  common: string[];
};

export const notify = createModel<RootModel>()({
  state: {
    common: [],
  } as NotifyState,

  reducers: {
    pushCommon: (state: NotifyState, message: string) => {
      state.common.push(message);
    },
    ask: (state: NotifyState) => {
      state.common.shift();
    },
  },

  effects: (dispatch) => ({
    pushError: (error: AxiosError<any>) => {
      const { response: res } = error;
      const message = res?.data?.message;
      if (message) {
        dispatch.notify.pushCommon(message);
      } else if (error?.message) {
        dispatch.notify.pushCommon(error.message);
      }
    },
  }),
});
