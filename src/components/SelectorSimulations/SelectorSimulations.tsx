import { Link } from 'react-router-dom';

const SelectorSimulations = () => {
  return (

    // plus tard affiche dynamique des simulations
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-8">
      <h1 className="text-4xl font-bold mb-8">Simulations</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        
        <Link to="/" className='text-black'>
            <div className="bg-white shadow-lg rounded-lg p-6 flex flex-col items-center h-64">
            <h2 className="text-2xl font-semibold mb-4">Simulation 1</h2>
            <p className="text-gray-500">Description of Simulation 1 goes here. It's a brief overview of what the simulation is about.</p>
            </div>
        </Link>

        <Link to="/" className='text-black'>
            <div className="bg-white shadow-lg rounded-lg p-6 flex flex-col items-center h-64">
            <h2 className="text-2xl font-semibold mb-4">Simulation 2</h2>
            <p className="text-gray-500">Description of Simulation 2 goes here. It's a brief overview of what the simulation is about.</p>
            </div>
        </Link>

      </div>
      
    </div>
  );
};

export default SelectorSimulations;
