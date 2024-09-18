import { configureStore } from '@reduxjs/toolkit';
import screenModeReducer from '../redux/screenModeSlice'; 

const store = configureStore({
  reducer: {
    screenMode: screenModeReducer // Ici on combine le reducer
  },
});

export default store;

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
