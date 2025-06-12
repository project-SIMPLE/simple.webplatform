import { useEffect, useRef, useState } from "react";
import { HEADSET_COLOR } from "../../api/constants.ts";
import visibility_off from "../../svg_logos/visibility_off.svg"
import x_cross from "../../svg_logos/x_cross.svg";

interface PlayerScreenCanvasProps {
    isPlaceholder?: boolean; //if true, will display an empty div. PlayerScreenCanvases are rendered using a list of canvases in the video stream manager. if the element is empty, it renders a canvas
    needsInteractivity?: boolean; //boolean used when a player screen canvas is displayed in the StreamPlayersScreenControl page, in order to be able to click each mirror to have a pop up window
    canvas?: HTMLCanvasElement;
    id?: string;
    canvasSize?: string;
    setActiveCanvas?: Function; //function that is passed as a prop by the videostreammanager, this function here returns the canvas and the ip of the headset that need to be displayed in a popup window
    hideInfos?: boolean; // boolean used in case you want to hide player id and identifier, used in case of fullscreen for example
}


const PlayerScreenCanvas = ({ canvas, id, isPlaceholder, needsInteractivity, canvasSize, hideInfos }: PlayerScreenCanvasProps) => {
    if (!id) {
        return null;
    }

    const ipIdentifier: string = id.split(":")[0].split(".")[id.split(".").length - 1];
    const canvasref = useRef<HTMLDivElement>(null);
    const popupref = useRef<HTMLDivElement>(null);
    const bgColor = HEADSET_COLOR[ipIdentifier] //careful, the constant file has been modified, these are now tailwind values
    const [showPopup, setShowPopup] = useState<boolean>(false);
    const isColoredHeadset = HEADSET_COLOR[ipIdentifier] !== undefined;
    const CanvasStyle = "flex flex-col border-4 m-0 p-0 border-slate-300 p-2 rounded-lg size-fit items-center"
    const croppingWorkaround = process.env.CROPPING_WORKAROUND;
    /**
    // this hook is used to add the canvases to the proper divs.
    // by default, it will use the base display (canvasref) that is the element of the list.
    // when the element is clicked, it will change showPopup to  True, and this hook will use the
    // other ref, which is popupref, that represents the popup window. additionnal parameters are 
    // passed to determine the size of the canvas on the screen 
    */
    useEffect(() => {
        if (canvas) {


            if (showPopup) {
                if (popupref.current) {
                    canvas.classList.add(...["rounded-b-lg"])
                    canvas.classList.remove("rounded-lg")
                    popupref.current.appendChild(canvas);
                }
            } else {
                if (canvasref.current) {
                    canvas.classList.add(...[canvasSize ? canvasSize : "h-[500px]", "rounded-lg"])
                    canvasref.current.appendChild(canvas);
                }
            }
        }
    })

    return (
        <>
            {/* Popup */}
            {showPopup === true ?
                <div className={`backdrop-blur-md w-full h-full fixed inset-0 flex flex-col items-center justify-center z-10`} onClick={() => setShowPopup(false)}>
                    {/* <div ref={popupref} className={` ${isColoredHeadset ? bgColor : "bg-slate-500"} size-2/3 flex flex-col items-center justify-center`}> */}
                    <div className={`bg-blue rounded-md p-4 m-4 h-3/4 w-1/2 ${isColoredHeadset ? bgColor : "bg-slate-300"} border-slate-200 border-4  flex flex-col items-center relative`} onClick={(e) => e.stopPropagation()}>
                        {hideInfos ? null : <div ref={popupref} className="h-full flex flex-col "><p className="bg-slate-200  rounded-t-md p-1 text-center "> {`Player: ${id}`}</p></div>}

                        <button
                            onClick={() => setShowPopup(false)}
                            className='bg-white hover:bg-gray-200 rounded-full p-1 size-fit mb-2'
                            style={{ position: 'absolute', top: '0.5rem', right: '0.5rem' }}
                        >
                            <img src={x_cross} alt="" className='mix-blend-difference size-8' />
                        </button>
                    </div>

                </div>
                : null}

            {/* actually meaningfull content */}
            {!isPlaceholder ?
                <div id={id} ref={!croppingWorkaround ? canvasref : null} className={`border-4 ${  isColoredHeadset ? bgColor : "bg-slate-500"} border-slate-300 ${CanvasStyle}`} onClick={needsInteractivity ? () => { setShowPopup(true) } : undefined}>
                    <div>
                        {/*↑ this div exists to make a unified block out of the player id and extra text added here and separate it from the canvas: [[id,ipIdentifier],canvas]  */}
                        {hideInfos ? null :
                            <>
                                <p>player:{id}</p>
                                {isColoredHeadset ? <p className="w-full text-center">identifier:{ipIdentifier} {false ? `couleur: (${HEADSET_COLOR[ipIdentifier]})` : null}</p> : null}
                            </>
                        }

                    </div>
                    {croppingWorkaround ? <div ref={canvasref} className="overflow-hidden aspect-square rounded-sm rotate-[22deg]"></div> : null}
                </div>


                :
                // placeholder, with an eye icon
                <div className={`${CanvasStyle} bg-stone-100`}>
                    {/* <p>Placeholder ici</p> */}
                    <img src={visibility_off} alt="" className="mix-blend-difference size-60" />
                </div>}
        </>
    )
}


// 

export default PlayerScreenCanvas;
