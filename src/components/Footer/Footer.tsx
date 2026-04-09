
const Footer = () => {
  return (


    <footer className="flex justify-between items-center w-full relative  mb-[3dvh]">
      <div className='flex gap-3 ml-10 mb-[1.6dvh] '>
        <img src={`images/funded-by-ue.png`} alt="UE" className="h-12" />
        <img src={`images/global-gateway-euro.png`} alt="GlobalGateway" className="h-12" />
        <img src={`images/nstda-logo.png`} alt="NSTDA" className="h-12" />
      </div>

      <div className='flex gap-[50px] mr-[5dvw] mb-[1.5dvh]' >
        <img src={`images/IRD-logo.png`} alt="IRD" className="h-12" />
        <img src={`images/ctu-logo.png`} alt="CTU" className="h-12" />
      </div>
    </footer>


  );
};

export default Footer;
