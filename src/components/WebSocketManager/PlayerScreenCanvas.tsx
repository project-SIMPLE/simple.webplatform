import { useEffect, useRef } from "react";
import { HEADSET_COLOR } from "../../api/constants.ts";
import visibility_off from "../../svg_logos/visibility_off.svg"
interface PlayerScreenCanvasProps {
    isPlaceholder?: boolean;
    canvas?: HTMLCanvasElement;
    id?: string;
}


const PlayerScreenCanvas = ({ canvas, id, isPlaceholder }: PlayerScreenCanvasProps) => {
    if (!id) {
        return null;
    }
    const ipIdentifier: string = id.split(":")[0].split(".")[id.split(".").length - 1];
    const canvasref = useRef<HTMLDivElement>(null);
    const bgColor = `bg-${HEADSET_COLOR[ipIdentifier]}-400`
    const isColoredHeadset = HEADSET_COLOR[ipIdentifier] !== undefined;
    
    useEffect(() => {
        if (canvas) {
            canvas.classList.add(...["max-w-32","rounded-lg"])
            if (canvasref.current) {
                canvasref.current.appendChild(canvas);
            }
        }
    })


    return (
        !isPlaceholder ?
        <div id={id} ref={canvasref} className={`border-4 bg-orange-400 ${isColoredHeadset ?  bgColor : "bg-slate-400 border-slate-300"} p-2 rounded-lg h-fit items-center justify-center flex flex-col`}>
            <div>
                <p>player:{id}</p>
                <p>identifier:{ipIdentifier} couleur: ({HEADSET_COLOR[ipIdentifier]})</p>
            </div>
        </div> 
        : 
        <div className="flex flex-col border-4 border-slate-300 p-2 rounded-lg bg-blue-300 items-center justify-center">
                <p>Placeholder ici</p>
                <img src={visibility_off} alt="" className="mix-blend-difference size-40" />
                </div>
        
    )
}


// ajouter un paramètre optionnel en plus: taille du canvas, qu'on rajoute à la classe du canvas (canva.classList.add(...[canvasSize])) attention, possiblement chiant, soit on utilise uniquement la notation tailwind (chiant a cause des gap entre les tailles) ou je trouve
// le moyen de rajouter un style, et là c'est la fête du slip

export default PlayerScreenCanvas;
