// src/components/VRHeadset.tsx
import React from 'react';

interface VRHeadsetProps {
  isConnected: boolean;
  className?: string;
  // add Player 
}

const VRHeadset: React.FC<VRHeadsetProps> = ({ isConnected, className }) => {
  return (
    <div 
    className={`flex flex-col items-center grayscale ${className}`}
    >
      <img
        src="/images/virtual-reality-headset-removebg-preview.png" // Placeholder image for VR headset
        alt="VR Headset"
        className="w-32 h-32 object-cover mb-2 "
        onClick={() => console.log('VR Headset clicked')} 
      />
      {/* <div
        className={`w-4 h-4 rounded-full ${
          isConnected ? 'bg-green-500' : 'bg-gray-500'
        }`}
      ></div> */}
    </div>
  );
};

export default VRHeadset;

