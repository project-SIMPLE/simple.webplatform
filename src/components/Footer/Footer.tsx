
const Footer = () => {
  return (


    <footer className="flex justify-between items-center w-full relative  mb-[3dvh]">
      <div className='flex gap-3 ml-[10px]'>
        <img src={`images/global-gateway-euro.png`} alt="GlobalGateway" className="h-12" />
        <img src={`images/funded-by-ue.png`} alt="UE" className="h-12" />
      </div>

      <div className='flex gap-[50px] mr-[50px]' >
        <img src={`images/IRD-logo.png`} alt="IRD" className="h-12" />
        <img src={`images/nstda-logo.png`} alt="NSTDA" className="h-12" />
        <img src={`images/ctu-logo.png`} alt="CTU" className="h-12" />
      </div>
    </footer>


  );
};

export default Footer;
