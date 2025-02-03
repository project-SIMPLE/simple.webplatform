import VRHeadset from "../VRHeadset/VRHeadset";
import { useTranslation } from "react-i18next";
import Footer from "../Footer/Footer";
import Button from "../Button/Button";
import trashbin from "../../../public/svg_logos/trashbin.svg"

type PlayerProps = {
  key: string;
  player?: any;
  handleRestart: (id: string) => void;
  handleRemove: (id: string) => void;
  togglePopUpshowPopUpManageHeadset: () => void;
}

const Player = ({ handleRestart, handleRemove, togglePopUpshowPopUpManageHeadset, key, player }: PlayerProps) => {
  const {t} = useTranslation();

  {
    // Object.keys(playerList).map((key) => {
    //   const player = playerList[key]; //TODO enlever ces commentaires
      return (
        <div key={key} className="flex flex-col items-center" >

          <VRHeadset
            key={key}
            selectedPlayer={player}
            playerId={key} />

          <>
            {/* Grey Overlay */}
            <div className="fixed inset-0 bg-gray-800 bg-opacity-75 z-50"  ></div>

            <div className="fixed inset-0 flex items-center justify-center z-50" onClick={togglePopUpshowPopUpManageHeadset}  >
              <div className="bg-white p-6 rounded-lg shadow-lg w-72 text-center"  >
                <h2 className="text-lg font-semibold mb-4"  >
                  {t('popop_question')} {key} ?
                </h2>

                <div className='flex gap-5 ml-3'  >

                  <button
                    className="bg-red-500 text-white px-4 py-2 mt-4 rounded"
                    onClick={() => handleRemove(key)}  >

                    {t('remove')}
                  </button>

                  <button
                    className="bg-orange-500 text-white px-4 py-2 mt-4 rounded"
                    onClick={() => handleRestart(key)}  >

                    {t('relaunch')}
                  </button>

                </div>



                <button
                  className="bg-red-500 text-white px-4 py-2 mt-6 rounded"
                  onClick={togglePopUpshowPopUpManageHeadset}  >

                  {t('cancel')}
                </button>
              </div>
            </div>
          </>

          {/* The trash */}
          <div className='flex gap-3 mt-2'  >
            <p style={{ marginTop: '3px' }}  > {key} </p>
            <Button
              bgColor='bg-red-500'
              icon={trashbin}
              onClick={togglePopUpshowPopUpManageHeadset}
            // onClick={() => handleRemove(key)}
            />


          </div>
          <Footer />
        </div>
      );

    }}



export default Footer;