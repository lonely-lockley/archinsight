import { createModel } from '@rematch/core';

import api from '../../api';
import { RootModel } from '../index';

type AppState = {
  image: string | null;
};

export const app = createModel<RootModel>()({
  state: {
    image: null,
  } as AppState,

  reducers: {
    setImage: (state: AppState, image: string) => {
      state.image = image;
    },
  },

  effects: (dispatch) => ({
    getRender: async (code: string) => {
      const action = async () => {
        const render = await api.render().post(code);
        if (render.data.source != undefined) {
            dispatch.app.setImage(render.data.source);
        }
      };
      dispatch.loading.wrapper({ action, name: 'getRender' });
    },
  }),
});
