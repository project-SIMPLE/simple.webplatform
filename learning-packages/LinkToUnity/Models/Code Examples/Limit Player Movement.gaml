/**
* Name: limitPlayerMovement
* Show how to limit the player movement in Unity: enable/disable the player movement, building invisible walls, defining a specific teleportation area. It works with the Scene "Assets/Scenes/Code Example/Limit Player Movement" from the Unity Template
* Author: Patrick Taillandier
* Tags: Unity, player movement
*/


model limitPlayerMovement

global {
	//geometry used to limit the movement of the player
	geometry free_area;
	
	//variable used to define is the player can move or not - call the update_player_movement each time the value of this variable is modified
	bool enable_movement <- true on_change: update_player_movement;
	
 	init {
 		//creation of the free_area geometry
 		point pt1 <- {25,25};
 		point pt2 <- {75,75};
 		free_area <- union([pt1 buffer 15, line([pt1,pt2]) + 8, pt2 buffer 15 ]);
 	}

	//called when the global variable enable_movement is modified
	action update_player_movement  {
		ask unity_linker {
			//for each player, call the enable_player_movement action from the unity_linker that enable/disable the movement of a player
			loop p over: unity_player {
				do enable_player_movement(
					player:p,
					enable:enable_movement
				);
			}
		}		
	}
}

//Species that will make the link between GAMA and Unity. It has to inherit from the built-in species asbtract_unity_linker
species unity_linker parent: abstract_unity_linker {
	//name of the species used to represent a Unity player
	string player_species <- string(unity_player);

	//in this model, information about the position of the player can be sent to Unity (if this position is modified), so we set do_info_world to true
	bool do_send_world <- true;
	
	
	//initial location of the player - here any_location of free_area with a offset along the z axis
	list<point> init_locations <- [any_location_in(free_area) + {0,0,0.5}];
	
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
		display map {
			graphics "free_area" {
				draw free_area color: #lightgreen;
			}
		}
	}
}

//default Unity (VR) experiment that inherit from the main experiment
//The unity type allows to create at the initialization one unity_linker agent
experiment vr_xp parent:main autorun: false type: unity {
	//minimal time between two simulation step
	float minimum_cycle_duration <- 0.01;

	//name of the species used for the unity_linker
	string unity_linker_species <- string(unity_linker);
	
	//allow to hide the "map" display and to only display the displayVR display 
	list<string> displays_to_hide <- ["map"];
	
	parameter "Enable player movement" var: enable_movement ;


	//action called by the middleware when a player connects to the simulation
	action create_player(string id) {
		ask unity_linker {
			//create the player
			do create_player(id);
			
			//build invisible walls surrounding the free_area geometry
			do build_invisible_walls(
				player: last(unity_player), //player to send the information to
				id: "wall_for_free_area", //id of the walls
				height: 40.0, //height of the walls
				wall_width: 1.0, //width ot the walls
				geoms: [free_area] //geometries used to defined the walls - the walls will be generated from the countour of these geometries
			);
			
			// change the area on which the player can teleport
			do send_teleport_area(
				player: last(unity_player), //player to send the information to
				id: "Teleport_free_area",//id of the teleportation area
				geoms: [free_area] //geometries used to defined the teleportation area
			);
			
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
	
	//variable used to avoid to move too fast the player agent
	float t_ref;

		 
	output { 
		//In addition to the layers in the map display, display the unity_player and let the possibility to the user to move players by clicking on it.
		display displayVR parent: map  {
			species unity_player;
			event #mouse_down  {
				ask world {
					if (#user_location overlaps free_area) {
						float t <- gama.machine_time;
						if (t - myself.t_ref) > 500 {
							ask unity_linker {
								move_player_event <- true;
							}
							myself.t_ref <- t;
						}
					}
				}
				
				
			}
		}
		
	} 
}