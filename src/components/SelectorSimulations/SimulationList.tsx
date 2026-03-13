import arrow_down from '../../svg_logos/arrow_drop_down.svg';
import { VU_MODEL_SETTING_JSON, VU_CATALOG_SETTING_JSON } from '../../api/core/Constants';
import { getLogger } from '@logtape/logtape';
const folder = process.env.IMAGE_SOURCE_FOLDER
interface SimulationListProps {
  list: (VU_MODEL_SETTING_JSON | VU_CATALOG_SETTING_JSON)[];
  handleSimulation: (index: number) => void;
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
      {list.map((simulation: VU_MODEL_SETTING_JSON | VU_CATALOG_SETTING_JSON, index: number) => (
        <div className='items-center text-center w-24 ' key={index}>

          <div
            className={`shadow-lg rounded-2xl items-center  cursor-pointer bg-slate-100 relative w-[100px] h-[100px] ${className}  ${!gama.connected ? 'opacity-50' : null}  ${simulation.type == "catalog"} `}
            key={index} onClick={gama.connected ? () => handleSimulation(index) : () => { }}>
            {simulation.type == "catalog" ? <img src={arrow_down} className='rounded-full bg-slate-500 opacity-90 size-16 absolute top-[18px] left-[18px] z-20' /> : null} {/* //? downward arrow */}
            <div className='relative size-full'>
              <img src={`public/images/${folder}/Headset/headset_frame.png`} alt="frame" className='absolute scale-110' />
              <img src={` ${simulation.splashscreen}`}
                className='size-[95%] -z-10'
                //@ts-expect-error target property of image does exist
                onError={(e) => { e.target.src = "/images/simple_logo.png"; logger.warn("couldn't load an image for simulation {index}, using the placeholder", { index }) }}
              />
            </div>



          </div>

          <h2
            className="text-gray-500 text-sm text-center mt-4"
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