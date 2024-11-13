/**
* Name: ClassicUI
* This wizard creates a new experiment file. 
* Author: drogoul
* Tags: 
*/

model RegularUI

import "Base Model.gaml"

global {
	
	point target_point;
	point start_point <- nil;
	 
	list<file> images <- [file("../includes/pencil.jpg"), file("../includes/eraser1.png"), file("../includes/gstart_icon.jpg"), file("../includes/build_icon.png")];
	
	 
	action after_creating_dyke;

	action create_dyke (float price) {
		create dyke with: (shape: line([start_point, #user_location]));
		budget <- update_budget_global(-price) with_precision 1;
		score <- update_score_global(-price);
		do after_creating_dyke;
	}
	
	float price_computation (point target) {
		return (start_point distance_to target) with_precision 1;
	}

	action action_management { 
		switch action_type { 
			match 0 {
				if start_point = nil {
					start_point <- #user_location; 
				} else {
					float price <- price_computation(#user_location);
					if (ok_build_dyke) {
						create dyke with: (shape: line([start_point, #user_location]));
						budget <- update_budget_global(-price) with_precision 1;
						score <- update_score_global(-price);
						do after_creating_dyke;
					}
 
					start_point <- nil;
					target_point <- nil;
					ok_build_dyke <- false;
				} }

			match 1 {
				list<dyke> d <- dyke overlapping (#user_location buffer 20);
				if (not empty(d)) {
					ask d closest_to #user_location {
						do die;
					}

				}

			}

			match 3 {
				list<dyke> d <- dyke overlapping (#user_location buffer 20);
				if (not empty(d)) {
					ask d closest_to #user_location {
						is_broken <- false;
						height <- height + 20.0;
						ask dyke where not each.is_broken {
							ask cell overlapping (shape + width) {
								dyke_altitude <- (myself.height);
								altitude <- (myself.height);
							}

						}

					}
 
				}

			} } }
		action activate_act {
		button selected_but <- first(button overlapping (circle(1) at_location #user_location));
		if (selected_but != nil) {
			if (selected_but.index = 2) {
				do start_simulation;
			} else {
				start_point <- nil;
				ask selected_but {
					ask button {
						bord_col <- #black;
					}

					if (action_type != id) {
						action_type <- id;
						bord_col <- #red;
					} else {
						action_type <- -1;
					}

				}

			}

		}

	}
}

grid button width: 2 height: 2 {
	int id <- int(self);
	rgb bord_col <- #black;

	aspect normal {
		draw rectangle(shape.width, shape.height).contour + (shape.height * 0.01) color: bord_col;
		draw image_file(images[id]) size: {shape.width , shape.height };
	}

}

experiment ClassicUI  type:gui  parent: "Base"{
	
	map<string, rgb> color_per_type <- ["CurrentDate"::current_date, "Budget"::budget, "LimitScore"::limitscore, "Score"::score];
	
	//parameter "Alert Strategy" var: the_alert_strategy init: "CLOSEST" among: ["RANDOM", "CLOSEST"] category: "Alert";
	//	parameter "Number of people" var: nb_of_people init: 100 min: 100 max: 20000 category: "Initialization";
	output {
		 layout horizontal([0.0::7285, 1::2715]) tabs:true controls:true editors: false consoles: false parameters: true ;

		display "UI" parent: map {
		//grid cell;
			graphics "point" {
				if start_point != nil {
					draw circle(30) color: #pink at: start_point;
				}

				if target_point != nil and ok_build_dyke {
					draw circle(30) color: #magenta at: target_point;
				} 

			}

			event #mouse_move {
				if (start_point != nil) {
					ask world {
						target_point <- #user_location;
						float p <- price_computation(target_point);
						ok_build_dyke <- p <= budget;
						if ok_build_dyke {
							geometry l <- line([start_point, target_point]);
							if ((cell overlapping l) first_with (each.is_river)) != nil {
								ok_build_dyke <- false;
							}

							if ok_build_dyke and (not empty(building overlapping l)) {
								ok_build_dyke <- false;
							}

						}

					}

				}

			}

			event #mouse_down {
				ask simulation {
					do action_management;
				}

			}

			overlay position: {5, 5} size: {300 #px, 150 #px} background: #black transparency: 0.2 border: #black rounded: true {
				float y <- 30 #px;
				loop type over: color_per_type.keys {
					if (type = "Score") {
						draw "Score:" + score at: {10 #px, y + 4 #px} color: #white font: font("Helvetica", 18, #bold);
					}

					if (type = "LimitScore") {
						draw "LimitScore:" + limitscore at: {10 #px, y + 4 #px} color: #white font: font("Helvetica", 18, #bold);
					}

					if (type = "Budget") {
						draw "Budget:" + budget at: {10 #px, y + 4 #px} color: #white font: font("Helvetica", 18, #bold);
					}

					if (type = "CurrentDate") {
						draw "CurrentDate: " + string(date(current_date)) at: {10 #px, y + 4 #px} color: #white font: font("Helvetica", 18, #bold);
					}
 
					y <- y + 30 #px;
				}

			}
			

		}
				 
		display action_button background: #black name: "Tools panel" type: 2d antialias: false toolbar: false {
			species button aspect: normal;
			event #mouse_down {
				ask simulation {
					do activate_act;
				}

			}

		}


		monitor "Number of people alive" value: evacuated;
		monitor "Number of people die" value: casualties;
		monitor "Number of road die" value: roaddie;
		monitor "Number of building drowned" value: buildingdie;
	}

	
	
}
