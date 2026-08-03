import { useState } from "react";
import { useTranslation } from "react-i18next";

const LanguageSelector = () => {
	const { t, i18n } = useTranslation();
	const [showPopup, setShowPopup] = useState(false);

	const changeLanguage = (lng: string) => {
		i18n.changeLanguage(lng);
		setShowPopup(false); // close pop up after changing language
	};

	const buttonStyle =
		"relative flex flex-row items-center justify-center cursor-pointer transition-transform duration-300 hover:scale-105 bg-transparent border-none p-0";

	return (
		<div className="flex flex-col  h-full justify-center z-10 mr-[95px] mt-[23px]">
			{/* Button to open the popup */}
			<button
				type="button"
				onClick={() => {
					setShowPopup(true);
				}}
				className="bg-transparent border-none p-0 flex items-center justify-center"
			>
				<img
					src={` /images/Language_selection/Language_selection_Button_00.png`}
					alt="language selection"
					className="size-[6dvh] cursor-pointer hover:scale-110 transition-transform duration-200"
				/>
			</button>

			{/* Pop-up */}
			{showPopup && (
				<button
					type="button"
					className="fixed inset-0 flex items-center justify-center bg-black/50 w-full h-full cursor-default border-none"
					onClick={() => setShowPopup(false)}
				>
					<button
						type="button"
						className=" p-6 rounded-lg w-80 relative top-0 right-0 cursor-default border-none bg-transparent"
						onClick={(e) => e.stopPropagation()}
					>
						<button
							type="button"
							className="absolute top-[6%] right-[11.5%] mr-1 z-10 hover:scale-110 transition-transform duration-200 bg-transparent border-none p-0"
							onClick={() => setShowPopup(false)}
						>
							<img
								src={` images/Language_selection/Language_selection_close.png`}
								alt=""
								className="size-[5dvh] cursor-pointer"
							/>
						</button>

						<h3 className="text-lg font-semibold mb-4">{t("select_language")}</h3>

						<img
							src={`images/Language_selection/Language_selection_tab.png`}
							className="absolute size-full inset-0"
							alt=""
						/>

						<div className="flex flex-col space-y-2 relative p-4 z-40">
							<button type="button" className={buttonStyle} onClick={() => changeLanguage("en")}>
								<img src={`images/Language_selection/Language_selection_Button_01.png`} alt="English" />
								<p className="absolute pointer-events-none pb-2">English</p>
							</button>
							<button type="button" className={buttonStyle} onClick={() => changeLanguage("fr")}>
								<img src={`images/Language_selection/Language_selection_Button_02.png`} alt="French" />
								<p className="absolute pointer-events-none pb-2">Français</p>
							</button>
							<button type="button" className={buttonStyle} onClick={() => changeLanguage("vi")}>
								<img src={`images/Language_selection/Language_selection_Button_03.png`} alt="Vietnamese" />
								<p className="absolute pointer-events-none pb-2">Việt</p>
							</button>
							<button type="button" className={buttonStyle} onClick={() => changeLanguage("th")}>
								<img src={`images/Language_selection/Language_selection_Button_04.png`} alt="Thai" />
								<p className="absolute pointer-events-none pb-2">แบบไทย</p>
							</button>
							<button type="button" className={buttonStyle} onClick={() => changeLanguage("lo")}>
								<img src={`images/Language_selection/Language_selection_Button_05.png`} alt="Lao" />
								<p className="absolute pointer-events-none pb-2">ພາສາລາວ</p>
							</button>
							<button type="button" className={buttonStyle} onClick={() => changeLanguage("km")}>
								<img src={`images/Language_selection/Language_selection_Button_06.png`} alt="Khmer" />
								<p className="absolute pointer-events-none pb-2 text-white">ភាសាខ្មែរ</p>
							</button>
						</div>
					</button>
				</button>
			)}
		</div>
	);
};

export default LanguageSelector;
