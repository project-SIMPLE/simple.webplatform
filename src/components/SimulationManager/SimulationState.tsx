
import React, {FC, useEffect } from 'react';


// define props type 
interface SimulationStateProps {
    experiment_state : string;
}

const SimulationState : FC<SimulationStateProps> = ({experiment_state}) => {
  
    const renderExperimentState = () => {
        
        console.log(experiment_state);
        
        switch (experiment_state) {
          case 'RUNNING':
            return (
              <div className="flex justify-center mb-4">
                <svg
                  className="w-6 h-6 mr-2 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="text-green-500">Simulation is running</span>
              </div>
            );
          case 'PAUSED':
            return (
              <div className="flex justify-center mb-4">
                <svg
                  className="w-6 h-6 mr-2 text-orange-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M10 9v6m4-6v6"
                  />
                </svg>
                <span className="text-orange-400">Simulation is paused</span>
              </div>
            );
          case 'NONE':
          default:
            return (
              <div className="flex justify-center mb-4">
                <svg
                  className="w-6 h-6 mr-2 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
                <span className="text-red-500">Simulation not launched</span>
              </div>
            );
        }
      };
  
    return (
        <>
            {renderExperimentState()}
        </>

  );
};


export default SimulationState;