import { Models, RematchDispatch, RematchRootState, init } from '@rematch/core';
import immerPlugin from '@rematch/immer';
import persistPlugin from '@rematch/persist';
import { useMemo } from 'react';
import { useDispatch as useDispatchRedux, useSelector as useSelectorRedux } from 'react-redux';
import storage from 'redux-persist/lib/storage';

import { app } from './models/app.model';
import { loading } from './models/loading.model';
import { notify } from './models/notify.model';
import { save } from './models/save.model';

export interface RootModel extends Models<RootModel> {
  app: typeof app;
  save: typeof save;
  notify: typeof notify;
  loading: typeof loading;
}

export const models: RootModel = {
  app,
  save,
  notify,
  loading,
};

const store = init<RootModel>({
  models,
  plugins: [immerPlugin(), persistPlugin({ key: 'root', storage, whitelist: ['save'] })],
});

export default store;

export type Dispatch = RematchDispatch<RootModel>;
export type RootState = RematchRootState<RootModel>;

export const useSelect = <T>(selector: (rootState: RootState) => T): T => {
  return useSelectorRedux(selector);
};

export const useDispatch = <T>(selector: (dispatch: Dispatch) => T): T => {
  const dispatch = useDispatchRedux();
  return useMemo(() => selector(dispatch as Dispatch), [dispatch, selector]);
};
