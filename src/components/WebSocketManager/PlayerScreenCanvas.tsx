import { useEffect, useRef, useState } from "react";
import { HEADSET_COLOR } from "../../api/core/Constants.ts";
import visibility_off from "../../svg_logos/visibility_off.svg"
import x_cross from "../../svg_logos/x_cross.svg";

//TODO pour fix le problème du canvas qui est en petit, puis qui devient grand quand tu clique dessus, regarder les hook qui sont trigger quand on clique sur le canvas (surtout le truc qui applique les classes tailwind)
//TODO et juste nettoyer complètement le css à chaque fois, et le réappliquer pour éviter le problème, quitte à ce que le code soit redondant
/* eslint react-hooks/rules-of-hooks: 0, curly: 2 */ //? desactive les avertissements sur les hooks qui sont appelés conditionnellement, ce qui n'arrive jamais dans ce cas
interface PlayerScreenCanvasProps {
    isPlaceholder?: boolean; //if true, will display an empty div. PlayerScreenCanvases are rendered using a list of canvases in the video stream manager. if the element is empty, it renders a canvas
    needsInteractivity?: boolean; //boolean used when a player screen canvas is displayed in the StreamPlayersScreenControl page, in order to be able to click each mirror to have a pop up window
    canvas?: HTMLCanvasElement;
    id?: string;
    canvasWidth?: string;
    canvasHeight?: string; //  height of the literal canvas HTML element, takes a literal objective css unit such as pix or vh. Defaults to value h-auto tailwind value
    setActiveCanvas?: (a: string) => void //function that is passed as a prop by the videostreammanager, this function here returns the canvas and the ip of the headset that need to be displayed in a popup window
    hideInfos?: boolean; // boolean used in case you want to hide player id and identifier, used in case of fullscreen for example
    tailwindCanvasDim: [string, string]; //tailwind raw dimensions to be passed to the canvas element
    isLimitingWidth?: boolean; //whether the maximum dimension is the width or the height
}


const PlayerScreenCanvas = ({ canvas, id, isPlaceholder, needsInteractivity, hideInfos, isLimitingWidth, tailwindCanvasDim }: PlayerScreenCanvasProps) => {
    if (!id) {
        return null;
    }

    const ipIdentifier: string = id.split(":")[0].split(".")[id.split(".").length - 1];
    const canvasref = useRef<HTMLDivElement>(null);
    const popupref = useRef<HTMLDivElement>(null);
    const bgColor = HEADSET_COLOR[ipIdentifier] //careful, the constant file has been modified, these are now tailwind values
    const [showPopup, setShowPopup] = useState<boolean>(false);
    const isColoredHeadset = HEADSET_COLOR[ipIdentifier] !== undefined;
    const CanvasStyle = "flex flex-col border-4 border-none p-2 rounded-lg items-center justify-center " //style of the colored border
    /**
    // this hook is used to add the canvases to the proper divs.
    // by default, it will use the base display (canvasref) that is the element of the list.
    // when the element is clicked, it will change showPopup to  True, and this hook will use the
    // other ref, which is popupref, that represents the popup window. additionnal parameters are 
    // passed to determine the size of the canvas on the screen 
    */
    useEffect(() => {
        if (canvas) {
            canvas.classList.remove(...canvas.classList)
            canvas.classList.add("rounded-lg")

            if (showPopup) {
                if (popupref.current) {
                    popupref.current.appendChild(canvas);
                     canvas.classList.add("max-h-[90dvh]")

                }
            } else {
                if (canvasref.current) {
                    canvas.classList.add(tailwindCanvasDim[0])
                    canvas.classList.add(tailwindCanvasDim[1])

                    if (canvas.classList.contains("max-h-[90dvh]")) {
                        canvas.classList.remove("max-h-[90dvh]")
                    }

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
                    <div className={`rounded-md size-fit border-4  flex flex-col items-center relative`} onClick={(e) => e.stopPropagation()}>
                        <div ref={popupref} className={`h-full flex flex-col ${isColoredHeadset ? bgColor : "bg-slate-500"}`}>
                            {hideInfos ?
                                null
                                :
                                <p className="bg-slate-200  rounded-t-md p-1 tailwindCanvasDim-center "> {`Player: ${id}`}</p>
                            }

                        </div>

                        <button
                            onClick={() => setShowPopup(false)}
                            className='bg-white hover:bg-gray-200 rounded-full p-1 size-fit mb-2w'
                            style={{ position: 'absolute', top: '0.5rem', right: '0.5rem' }}
                        >
                            <img src={x_cross} alt="" className='mix-blend-difference size-8' />
                        </button>
                    </div>

                </div>
                : null}

            {/* meaningful content */}
            {!isPlaceholder ?
                <div id={id} className={`${CanvasStyle}size-fit ${isLimitingWidth ? "max-w-full h-full" : "max-h-full w-full"}`} onClick={needsInteractivity ? () => { setShowPopup(true) } : undefined}>
                    {hideInfos ? null :
                        <div>
                            <p>player:{id}</p>
                            {isColoredHeadset ? <p className="tailwindCanvasDim-center">identifier:{ipIdentifier} </p> : null}
                        </div>
                    }

                    <div className={`flex flex-col items-center justify-center p-2 rounded-lg size-fit`}>{/*  size of the invisible container of the colored background */}
                        <div ref={canvasref} className={`${isColoredHeadset ? bgColor : "bg-slate-300"}  p-2 rounded-lg`} ></div>
                    </div>
                </div>



                :
                //  placeholder, with an eye icon
                <div className={`${CanvasStyle} bg-stone-100 ${isLimitingWidth ? "max-w-full h-full" : "max-h-full w-full"} aspect-square m-2`}> {/*this only works under the assumption that the width is bigger than the height of the screen*/}
                    {/* {tailwindCanvasDim} */}
                    <img src={visibility_off} alt="" className="mix-blend-difference size-full" />
                </div >

            }

        </>
    )
}


// 

export default PlayerScreenCanvas;
