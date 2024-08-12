import React from 'react';

const StreamPlayerScreen: React.FC = () => {
  return (
    <div className="relative w-full h-screen bg-gray-100">

      {/* Top Left Rectangle */}
      <div className="absolute top-0 left-0 w-1/4 h-1/4 bg-gray-600 flex items-center justify-center">
        <div className="absolute top-2 left-2">
          <button className="bg-green-500 text-white px-4 py-2 rounded">Play</button>
          <button className="bg-red-500 text-white px-4 py-2 rounded ml-2">Stop</button>
        </div>
      </div>

      {/* Top Right Rectangle */}
      <div className="absolute top-0 right-0 w-1/4 h-1/4 bg-gray-600 flex items-center justify-center">
        <div className="absolute top-2 right-2">
          <button className="bg-green-500 text-white px-4 py-2 rounded">Play</button>
          <button className="bg-red-500 text-white px-4 py-2 rounded ml-2">Stop</button>
        </div>
      </div>

      {/* Bottom Left Rectangle */}
      <div className="absolute bottom-0 left-0 w-1/4 h-1/4 bg-gray-600 flex items-center justify-center">
        <div className="absolute bottom-2 left-2">
          <button className="bg-green-500 text-white px-4 py-2 rounded">Play</button>
          <button className="bg-red-500 text-white px-4 py-2 rounded ml-2">Stop</button>
        </div>
      </div>

      {/* Bottom Right Rectangle */}
      <div className="absolute bottom-0 right-0 w-1/4 h-1/4 bg-gray-600 flex items-center justify-center">
        <div className="absolute bottom-2 right-2">
          <button className="bg-green-500 text-white px-4 py-2 rounded">Play</button>
          <button className="bg-red-500 text-white px-4 py-2 rounded ml-2">Stop</button>
        </div>
      </div>

      {/* Center Rectangle */}
      <div className="absolute inset-0 m-auto w-3/5 h-3/5 bg-gray-400 flex items-center justify-center">
        {/* Center Content Here */}
      </div>

    </div>
  );
};

export default StreamPlayerScreen;
