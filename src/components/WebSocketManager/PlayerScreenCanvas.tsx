import { useEffect, useRef } from "react";
import { HEADSET_COLOR } from "../../api/constants.ts";
import visibility_off from "../../svg_logos/visibility_off.svg"
interface PlayerScreenCanvasProps {
    isPlaceholder?: boolean; //if true, will display an empty div. PlayerScreenCanvases are rendered using a list of canvases in the video stream manager. if the element is empty, it renders a canvas
    needsInteractivity?: boolean; //boolean used when a player screen canvas is displayed in the StreamPlayersScreenControl page, in order to be able to click each mirror to have a pop up window
    canvas?: HTMLCanvasElement;
    id?: string;
    canvasSize?: string;
    setActiveCanvas?: Function; //function that is passed as a prop by the videostreammanager, this function here returns the canvas and the ip of the headset that need to be displayed in a popup window

}


const PlayerScreenCanvas = ({ canvas, id, isPlaceholder, needsInteractivity, canvasSize, setActiveCanvas }: PlayerScreenCanvasProps) => {
    if (!id) {
        return null;
    }

    const ipIdentifier: string = id.split(":")[0].split(".")[id.split(".").length - 1];
    const canvasref = useRef<HTMLDivElement>(null);
    const bgColor = `bg-${HEADSET_COLOR[ipIdentifier]}-400`
    const isColoredHeadset = HEADSET_COLOR[ipIdentifier] !== undefined;

    useEffect(() => {
        if (canvas) {
            canvas.classList.add(...[canvasSize ? canvasSize : "max-w-32", "rounded-lg"])
            if (canvasref.current) {
                canvasref.current.appendChild(canvas);
            }
        }
    })

    if (needsInteractivity) {
        return (
            !isPlaceholder ?
                <div id={id} ref={canvasref} className={`border-4 bg-orange-400 ${isColoredHeadset ? bgColor : "bg-slate-400 border-slate-300"} p-2 rounded-lg h-fit items-center justify-center flex flex-col`}>
                    <div>
                        {/*↑ this div exists to make a unified block out of the player id and extra text added here and separate it from the canvas: [[id,ipIdentifier],canvas]  */}
                        <p>player:{id}</p>
                        {isColoredHeadset ? <p>identifier:{ipIdentifier} couleur: ({HEADSET_COLOR[ipIdentifier]})</p> : null}
                    </div>
                </div>
                :

                <div className="flex flex-col border-4 border-slate-300 p-2 rounded-lg bg-blue-300 items-center justify-center">
                    <p>Placeholder ici</p>
                    <button onClick={() => setActiveCanvas?.([id,canvas])}>set active canvas ici</button>
                    <img src={visibility_off} alt="" className="mix-blend-difference size-40" />
                </div>

        )

    } else {
        return (
            !isPlaceholder ?
                <div id={id} ref={canvasref} className={`border-4 bg-orange-400 ${isColoredHeadset ? bgColor : "bg-slate-400 border-slate-300"} p-2 rounded-lg h-fit items-center justify-center flex flex-col`}>
                    <div>
                        {/*↑ this div exists to make a unified block out of the player id and extra text added here and separate it from the canvas: [[id,ipIdentifier],canvas]  */}
                        <p>player:{id}</p>
                        {isColoredHeadset ? <p>identifier:{ipIdentifier} couleur: ({HEADSET_COLOR[ipIdentifier]})</p> : null}
                    </div>
                </div>
                :

                <div className="flex flex-col border-4 border-slate-300 p-2 rounded-lg bg-blue-300 items-center justify-center">
                    <p>Placeholder ici</p>
                    <img src={visibility_off} alt="" className="mix-blend-difference size-40" />
                </div>

        )
    }
}

// 

export default PlayerScreenCanvas;
