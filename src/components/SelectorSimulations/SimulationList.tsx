
import { VU_MODEL_SETTING_JSON, VU_CATALOG_SETTING_JSON } from '../../api/core/Constants';
import { getLogger } from '@logtape/logtape';
 
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

  const frame = [
    ` /images/Game_selection/Game_selection_Aquadefender.png`,
    ` /images/Game_selection/Game_selection_Lulut.png`,
    ` /images/Game_selection/Game_selection_Cambodia.png`,
    ` /images/Game_selection/Game_selection_Biodivrestorer.png`,
    ` /images/Game_selection/Game_selection_OZD.png`,
    ` /images/Game_selection/Game_selection_Lao.png`,
  ]


  return (
    <div className="flex flex-row w-full justify-evenly">
      {list.map((simulation: VU_MODEL_SETTING_JSON | VU_CATALOG_SETTING_JSON, index: number) => (
        <div className='items-center text-center w-fit ' key={index}>

          <div
            className={`rounded-2xl items-center  cursor-pointer relative size-[13dvw]  ${className && className}  ${!gama.connected && 'opacity-50' }`}
            key={index} onClick={gama.connected ? () => handleSimulation(index) : () => { }}>
            {/* {simulation.type == "catalog" ? <img src={` /images/Headset/Headset_04_orange.png`} className='rounded-full bg-slate-500 opacity-90 size-16 absolute top-[40%] left-[40%] z-20' /> : null} //? downward arrow */}
            <div className='relative size-full bg-[#fcf7ec] hover:scale-110 transition-transform duration-200'>
              {simulation.type === "catalog" ?
                <img src={` /images/Game_selection/Game_selection_Folder.png`} className='absolute scale-110 top-[-10%]' alt="" />
                :
                <img src={frame[Math.floor(Math.random() * 5)]} alt="frame" className='absolute scale-110' />
              }
              {/* //TODO the src of the image is a placeholder, selects one of the 5 frames at random */}
              <img src={` ${simulation.splashscreen}`}
                className='h-full -z-10 bg-[#fcf7ec]'
                //@ts-expect-error target property of image does exist
                onError={(e) => { e.target.src = "/images/simple_logo.png"; logger.warn("couldn't load an image for simulation {index}, using the placeholder", { index }) }}
              />
            </div>



          </div>

          <h2
            className="text-sm text-center mt-7 text-[#0B374D]"
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