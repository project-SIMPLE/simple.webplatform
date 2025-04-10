import arrow_down from '../../svg_logos/arrow_drop_down.svg';

interface SimulationListProps {
  list: any[];
  handleSimulation: any;
  gama: any;
  className?: string;
}

const SimulationList = ({ list, handleSimulation, gama, className }: SimulationListProps) => {


  return (
    <div className="flex mt-5 mb-8" style={{ gap: '55px' }}>

      {list.map((simulation, index) => (
        <div className='items-center text-center w-24'>       
          <div
          className={`bg-white shadow-lg rounded-3xl p-6 flex flex-col items-center h-40 cursor-pointer
                    ${className} 
                    ${!gama.connected ? 'opacity-50 cursor-not-allowed' : ''} 
                    ${simulation.type == "catalog"}  
                    `}

          style={{
            backgroundImage: simulation.type == "json_settings" ? `url(${simulation.splashscreen})` : simulation.splashscreen ? `url(${simulation.splashscreen})` : `url(/images/codecode.png)`,
            backgroundSize: 'cover',
            width: '100px',
            height: '100px',
            zIndex: 1,
          }}


          key={index}
          onClick={gama.connected ? () => handleSimulation(index) : () => { }}
        >
          {simulation.type == "catalog" ? <img src={arrow_down} className='rounded-full bg-slate-500 opacity-90 size-16' /> : null} {/* //? downward arrow */}




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