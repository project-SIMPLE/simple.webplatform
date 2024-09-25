import { configureStore, ThunkAction, Action } from '@reduxjs/toolkit';
import screenModeReducer from '../redux/screenModeSlice'; // Corriger le chemin si nécessaire

export const store = configureStore({
  reducer: {
    screenMode: screenModeReducer, // Assurez-vous d'ajouter tous les reducers dont vous avez besoin
  },
});

// Typage pour l'utilisation dans le projet
export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof store.getState>;
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action<string>
>;
