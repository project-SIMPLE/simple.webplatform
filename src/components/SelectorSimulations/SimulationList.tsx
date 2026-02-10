import arrow_down from '../../svg_logos/arrow_drop_down.svg';
import { Simulation } from '../../api/core/Constants';
import { getLogger } from '@logtape/logtape';
interface SimulationListProps {
  list: Simulation[];
  handleSimulation: (index) => void;
  gama: {
    connected: boolean;
    loading: "hidden" | "visible";
    experiment_state: string;
    experiment_name: string;
    content_error: string;
  }
  className?: string;
}
const logger = getLogger(["components", "SimulationList"]);

const SimulationList = ({ list, handleSimulation, gama, className }: SimulationListProps) => {


  return (
    <div className="flex mt-5 mb-8" style={{ gap: '55px' }}>

      {list.map((simulation, index) => (
        <div className='items-center text-center w-24 ' key={index}>
          <div
            className={`shadow-lg rounded-2xl items-center h-40 cursor-pointer bg-slate-100 relative
                    ${className} 
                    ${!gama.connected ? 'opacity-50' : null} 
                    ${simulation.type == "catalog"}  
                    `}

            style={{
              width: '100px',
              height: '100px',
              zIndex: 1,
            }}


            key={index}
            onClick={gama.connected ? () => handleSimulation(index) : () => { }}
          >{/*The absolute positionning guarantees that the image is the only static child so it takes the whole screen top and left are there to position the down arrow */}
            {simulation.type == "catalog" ? <img src={arrow_down} className='rounded-full bg-slate-500 opacity-90 size-16 absolute top-[18px] left-[18px]' /> : null} {/* //? downward arrow */}
            <img src={` ${simulation.splashscreen}`}
              onError={(e) => { e.target.src = "/images/simple_logo.png"; logger.warn("couldn't load an image for simulation {index}, using the placeholder", { index }) }}
              className='size-full rounded-2xl'
            />



          </div>

          <h2
            className="text-gray-500 text-sm text-center mt"
          >
            {/*                                                                                                                     ↓ added one for folders to start at 1 instead of 0 */}
            {simulation.type == "json_settings" ? simulation.name : simulation.name ? simulation.name : `subprojects folder n°${index + 1}`}
          </h2>
        </div>
      ))}
    </div>


  )

}


export default SimulationList