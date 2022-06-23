import { Models, RematchDispatch, RematchRootState, init } from '@rematch/core';
import immerPlugin from '@rematch/immer';
import loadingPlugin, { ExtraModelsFromLoading } from '@rematch/loading';
import persistPlugin from '@rematch/persist';
import { useMemo } from 'react';
import { useDispatch as useDispatchRedux, useSelector as useSelectorRedux } from 'react-redux';
import storage from 'redux-persist/lib/storage';

import { app } from './models/app.model';
import { save } from './models/save.model';

type FullModel = ExtraModelsFromLoading<RootModel, { type: 'full' }>;

export interface RootModel extends Models<RootModel> {
  app: typeof app;
  save: typeof save;
}

export const models: RootModel = {
  app,
  save,
};

const store = init<RootModel, FullModel>({
  models,
  plugins: [
    immerPlugin(),
    loadingPlugin({ type: 'full' }),
    persistPlugin({ key: 'root', storage, whitelist: ['save'] }),
  ],
});

export default store;

export type Dispatch = RematchDispatch<RootModel>;
export type RootState = RematchRootState<RootModel, FullModel>;

export const useSelect = <T>(selector: (rootState: RootState) => T): T => {
  return useSelectorRedux(selector);
};

export const useDispatch = <T>(selector: (dispatch: Dispatch) => T): T => {
  const dispatch = useDispatchRedux();
  return useMemo(() => selector(dispatch as Dispatch), [dispatch, selector]);
};
