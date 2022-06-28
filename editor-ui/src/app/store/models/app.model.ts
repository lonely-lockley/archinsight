import { createModel } from '@rematch/core';
import axios from 'axios';

import { RootModel } from '../index';

type AppState = {
  api: API;
  image: string | null;
};

type API = {
  compiler: string | null;
  renderer: string | null;
};

export const app = createModel<RootModel>()({
  state: {
    api: {
      compiler: null,
      renderer: null,
    },
    image: null,
  } as AppState,

  reducers: {
    setAPI: (state: AppState, api: API) => {
      state.api = api;
    },
    setImage: (state: AppState, image: string) => {
      state.image = image;
    },
  },

  effects: (dispatch) => ({
    loadAPI: async () => {
      const res = await axios.get<API>(`${window.location.origin}/api.json`);
      dispatch.app.setAPI(res.data);
    },

    getRender: async (code: string, state) => {
      const { renderer, compiler } = state.app.api;
      if (!renderer || !compiler) throw Error('API URL is not provided');

      const {
        data: { source },
      } = await axios.post<{ source: string }>(`${compiler}/compile`, {
        source: code.replace(/\r/g, ''),
      });

      if (!source) throw Error('Compiler returns null');

      const render = await axios.post<string>(`${renderer}/render`, { source });

      dispatch.app.setImage(render.data);
    },
  }),
});