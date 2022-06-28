import { createModel } from '@rematch/core';
import { AxiosError } from 'axios';

import { RootModel } from '../index';

type LoadingState = {
  isLoading: Record<string, boolean | undefined>;
  isSuccess: Record<string, boolean | undefined>;
};

type WrapperAction = {
  action: () => void;
  name: string;
};

export const loading = createModel<RootModel>()({
  state: {
    isLoading: {},
    isSuccess: {},
  } as LoadingState,

  reducers: {
    preAction: (state: LoadingState, name: string) => {
      state.isLoading[name] = true;
      state.isSuccess[name] = false;
    },
    onSuccess: (state: LoadingState, name: string) => {
      state.isSuccess[name] = true;
    },
    onFinally: (state: LoadingState, name: string) => {
      state.isLoading[name] = false;
    },
  },

  effects: (dispatch) => ({
    wrapper: async ({ action, name }: WrapperAction) => {
      try {
        dispatch.loading.preAction(name);
        await action();
        dispatch.loading.onSuccess(name);
      } catch (err) {
        dispatch.notify.pushError(err as AxiosError);
      } finally {
        dispatch.loading.onFinally(name);
      }
    },
  }),
});
