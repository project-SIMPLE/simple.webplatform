import Button from '../Button/Button';
import { useWebSocket } from '../WebSocketManager/WebSocketManager';
const SimulationManagerButtons : React.FC = () => {
    const { ws, gama} = useWebSocket();

      const handlePlayPause = () => {
        if(ws !== null){
            ws.send(JSON.stringify({"type": gama.experiment_state == "NONE" ? "launch_experiment" : (gama.experiment_state != "RUNNING" ? "resume_experiment" : "pause_experiment") }));
          }else{
          console.error("WS is null");
        }
      };
    
      const handleEnd = () => {
        if(ws !== null){
            ws.send(JSON.stringify({"type": "stop_experiment"}));
          }else{
          console.error("WS is null");
        }
      };

      


      const icon = gama.experiment_state === 'LAUNCHING'  ? (
        <svg
          className="w-7 h-7"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth="2"
            d="M10 9v6m4-6v6" // Verticals bars for "pause"
          />
        </svg>

      ) : gama.experiment_state === 'NONE' || gama.experiment_state === 'NOTREADY' || gama.experiment_state === 'PAUSED' ? (
        <svg
          className="w-7 h-7 "
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth="2"
            d="M5 3l14 9-14 9V3z" // triangle for "play"
          />
        </svg>
      ) : (
        <svg
          className="w-7 h-7"
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
      );

    return (
      <div>
            
            <div className="flex justify-center space-x-2 gap-10 mb-8 mt-8">
            
                {/* add a new button */}
                <Button
                  onClick={handlePlayPause}
                  customStyle={{width: '100px', height:'50px'}}
                  // text={ 
                  //   gama.experiment_state === 'NONE' ? 'Launch' :
                  //   gama.experiment_state === 'RUNNING' ? 'Pause' :
                  //   gama.experiment_state === 'NOTREADY' ? 'Not Ready' : 'Resume'
                  // }
                  bgColor={
                    gama.experiment_state === 'RUNNING'
                    ? 'bg-orange-500' 
                    : 'bg-green-500'
                  }  
                icon={ icon
                }
                  showText={true}
                />

                <Button 
                  onClick={handleEnd} 
                  className='w-20'                
                  customStyle={{width: '100px', height:'50px'}}

                  bgColor="bg-red-500" 
                  icon={
                    <svg
                        className="w-7 h-7 "
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
                  } 
                  showText={true} 
                />
                
            </div>
            

        


      </div>
          
    );
};

export default SimulationManagerButtons;