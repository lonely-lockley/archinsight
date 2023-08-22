import { createModel } from '@rematch/core';

import api from '../../api';
import LinkerMessage from '../../api/TranslatorResponse';
import { RootModel } from '../index';

type AppState = {
  image: string | null;
  messages: LinkerMessage[] | null
};

export const app = createModel<RootModel>()({
  state: {
    image: null,
  } as AppState,

  reducers: {
    setImage: (state: AppState, image: string) => {
      state.image = image;
    },
    notifyErrors: (state: AppState, messages: LinkerMessage[]) => {
      state.messages = messages;
    },
  },

  effects: (dispatch) => ({
    getRender: async (code: string) => {
      const action = async () => {
        const render = await api.render().post(code);
        if (render.data.source != undefined) {
            dispatch.app.setImage(render.data.source);
        }
        if (render.data.messages != undefined) {
            dispatch.app.notifyErrors(render.data.messages);
        }
      };
      dispatch.loading.wrapper({ action, name: 'getRender' });
    },
  }),
});
