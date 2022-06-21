import { createModel } from '@rematch/core';

import { RootModel } from '../index';

type SaveState = {
  code: string;
};

export const save = createModel<RootModel>()({
  state: {
    code: '',
  } as SaveState,

  reducers: {
    setCode: (state: SaveState, code: string) => {
      state.code = code;
    },
  },

  effects: (dispatch) => ({
    updateCode: (code: string) => {
      dispatch.save.setCode(code);
    },
  }),
});
