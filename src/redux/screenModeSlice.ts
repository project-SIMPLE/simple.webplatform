import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface ScreenModeState {
  screenMode: string;
}

const initialState: ScreenModeState = {
  screenMode: 'shared_screen', // État initial
};

const screenModeSlice = createSlice({
  name: 'screenMode',
  initialState,
  reducers: {
    setScreenMode(state, action: PayloadAction<string>) {
      state.screenMode = action.payload;
    }
  },
});

export const { setScreenMode } = screenModeSlice.actions;
export default screenModeSlice.reducer;
