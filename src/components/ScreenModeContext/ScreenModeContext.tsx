// context/ScreenModeContext.tsx
import React, { createContext, useState, useContext, ReactNode } from 'react';

// 
// should  use a reducer to manage the state of the screenModeDisplay
// 

// Type for context state
interface ScreenModeContextType {
  screenModeDisplay: string;
  setScreenModeDisplay: (mode: string) => void;
}

// Create context
const ScreenModeContext = createContext<ScreenModeContextType | undefined>(undefined);

// Provider component
export const ScreenModeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [screenModeDisplay, setScreenModeDisplay] = useState<string>('gama_screen'); 

  return (
    <ScreenModeContext.Provider value={{ screenModeDisplay, setScreenModeDisplay }}>
      {children}
    </ScreenModeContext.Provider>
  );
};

// Hook to access only screenModeDisplay (read-only)
export const useScreenModeState = () => {
  const { screenModeDisplay } = useScreenMode();
  return screenModeDisplay;
};

// Hook to access only setScreenModeDisplay (setter)
export const useScreenModeSetter = () => {
  const { setScreenModeDisplay } = useScreenMode();
  return setScreenModeDisplay;
};

// Custom hook for consuming the full context
export const useScreenMode = () => {
  const context = useContext(ScreenModeContext); // use the current context , and return the value of the context
  if (!context) {
    throw new Error('useScreenMode must be used within a ScreenModeProvider');
  }
  return context; // it display the value of the context which is here : { screenModeDisplay, setScreenModeDisplay }
};
