
const folder = process.env.IMAGE_SOURCE_FOLDER;
const Footer = () => {
    return (


        <footer className="flex justify-between items-center p-4 border-t border-gray-300  w-full">
        <div className='flex'>
          <img src={`images/${folder}/Logos/Logo_Global_gateway.png`} alt="GlobalGateway" className="h-12" />
          <img src={`images/${folder}/Logos/Logo_UE.png`} alt="UE" className="h-12" />
        </div>

        <div className='flex gap-3' >
          <img src={`images/${folder}/Logos/Logo_IRD.png`} alt="IRD" className="h-12" />
          <img src={`images/${folder}/Logos/Logo_NSTDA.png`} alt="NSTDA" className="h-12" />
          <img src={`images/${folder}/Logos/Logo_Can_Tho.png`} alt="CTU" className="h-12" />
        </div>
      </footer>

    
      );
    };
    
    export default Footer;
    