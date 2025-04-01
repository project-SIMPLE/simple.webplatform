/**
* Name: importGeometriesFromUnity
* Author: Patrick Taillandier
* Description: A simple model allow to import geometries from Unity. To be used with the "Export geometries to GAMA"
* Tags: gis, shapefile, unity, geometry, 
*/
model importGeometriesFromUnity

global {
	
	string output_file <- "generated/blocks.shp";
	
	geometry shape <- square(100);
	
	int crs_code <- 2154;	
	
	bool geometries_received <- false;
	
	init {
		write "Waiting to receive geometries";
	}
}


species unity_linker parent: abstract_unity_linker {
	// connection port
	list<point> init_locations <- [{50.0, 50.0}];
	string player_species <- string(unity_player);
	bool do_send_world <- true;
	
	action receive_geometries(string geoms) {
		if ("points" in geoms) {
			map answer <- from_json(geoms);
			list<list<list>> objects <- answer["points"];
			list<int> heights <- answer["heights"];
			list<string> names <- answer["names"];
			list<point> pts;
			int cpt <- 0;
			loop coords over: objects {
				loop pt over: coords {
					if empty(pt) {
						float tol <- 0.0001;
						list<geometry> gs <- [];
						list<point> ps <- [];
						if not empty(pts)and length(pts) > 2 {
								
							list<point> ts;
							list<geometry> triangles;
							
							loop i from: 0 to: length(pts) -1 {
								ts << pts[i];
								if (length(ts) = 3) {
									triangles << polygon(ts);
									ts <- [];
									
								}
										
							}
							geometry g <- union(triangles collect (each+ tol));
							loop gg over: g.geometries {
								create object with:(shape: gg, name:names[cpt]);
							}
							
						}
					 
						cpt <- cpt +1;
						pts <- [];
					
					} else {
						pts << {float(pt[0])/self.precision ,float(pt[1]) /self.precision};
					}
				}
			}
			geometries_received <- true;
			save object to: output_file format:"shp" crs: crs_code;
			 
			write "Geometries received";			
			ask world {
				do pause;
			}
		}
		
			
	}
	
}

//Species to represent the object imported
species object {

	aspect default {
		draw shape color: #white ;
	}

}

//species used to represent an unity player, with the default attributes. It has to inherit from the built-in species asbtract_unity_player
species unity_player parent: abstract_unity_player {
	//size of the player in GAMA
	float player_size <- 1.0;

	//color of the player in GAMA
	rgb color <- #red ;
	
	//vision cone distance in GAMA
	float cone_distance <- 10.0 * player_size;
	
	//vision cone amplitude in GAMA
	float cone_amplitude <- 90.0;

	//rotation to apply from the heading of Unity to GAMA
	float player_rotation <- 90.0;
	
	//display the player
	bool to_display <- true;
	
	
	//default aspect to display the player as a circle with its cone of vision
	aspect default {
		if to_display {
			if selected {
				 draw circle(player_size) at: location + {0, 0, 4.9} color: rgb(#blue, 0.5);
			}
			draw circle(player_size/2.0) at: location + {0, 0, 5} color: color ;
			draw player_perception_cone() color: rgb(color, 0.5);
		}
	}
}


experiment main type: gui {
	output {
		display map type: 3d{
			species object;
		}
	}
}

//default Unity (VR) experiment that inherit from the SimpleMessage experiment
//The unity type allows to create at the initialization one unity_linker agent
experiment LoadGeometriesFromUnity parent:main autorun: true type: unity {
	//minimal time between two simulation step
	float minimum_cycle_duration <- 0.05; 

	//name of the species used for the unity_linker
	string unity_linker_species <- string(unity_linker);
	
	


	//action called by the middleware when a player connects to the simulation
	action create_player(string id) {
		ask unity_linker {
			do create_player(id);
		}
	}

	//action called by the middleware when a plyer is remove from the simulation
	action remove_player(string id_input) {
		if (not empty(unity_player)) {
			ask first(unity_player where (each.name = id_input)) {
				do die;
			}
		}
	}

}