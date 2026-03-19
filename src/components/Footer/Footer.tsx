const folder = process.env.IMAGE_SOURCE_FOLDER
const Footer = () => {
  return (


    <footer className="flex justify-between items-center w-full relative m-[50px]">
      {folder === "V2" &&
      <img src={`/images/${folder}/Frames/footer.svg`} alt="" className="absolute"/>
      }
      <div className='flex gap-3 z-10 ml-[10px]'>
        <img src={`images/global-gateway-euro.png`} alt="GlobalGateway" className="h-12" />
        <img src={`images/funded-by-ue.png`} alt="UE" className="h-12" />
      </div>

      <div className='flex gap-[50px] z-10 mr-[50px]' >
        <img src={`images/IRD-logo.png`} alt="IRD" className="h-12" />
        <img src={`images/nstda-logo.png`} alt="NSTDA" className="h-12" />
        <img src={`images/ctu-logo.png`} alt="CTU" className="h-12" />
      </div>
    </footer>


  );
};

export default Footer;
