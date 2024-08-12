/**
* Name: SendStaticdata
* Show how to send static geometries/agents to Unity. It works with the Scene "Assets/Scenes/Code Example/Receive Static Data" from the Unity Template
* Author: Patrick Taillandier
* Tags: Unity, static geometries/agents
*/


model SendStaticdata

global {
	//unity properties that will be used for sending geometries/agents to Unity
	unity_property up_tree ;
	unity_property up_geom;
	
	
	
 	init {
 		geometry free_place <- shape buffer (-10.0);
 		create static_geometry_agent number: 5 {
 			shape <- square(10);
 			location <- any_location_in(free_place);
 			free_place <- free_place - (shape + 10);
 		}
 		
 		create static_punctual_agent number: 2 {
 			location <- any_location_in(free_place);
 			free_place <- free_place - (shape + 10);
 		}
 	}

}


species static_punctual_agent {
	aspect default {
		draw circle(10) color: #green;
	}
}


species static_geometry_agent {
	aspect default {
		draw shape color: #gray;
	}
}


//Species that will make the link between GAMA and Unity. It has to inherit from the built-in species asbtract_unity_linker
species unity_linker parent: abstract_unity_linker {
	//name of the species used to represent a Unity player
	string player_species <- string(unity_player);

	//in this model, no information will be automatically sent to the Player at every step, so we set do_info_world to false
	bool do_send_world <- false;
	
	
	//initial location of the player
	list<point> init_locations <- [world.location];
	
	
	init {
		//define the unity properties
		do define_properties;
		
		//add the static_geometry agents as static agents/geometries to send to unity with the up_geom unity properties.
		do add_background_geometries(static_geometry_agent,up_geom);
		
		
		//add the static_punctual_agent agents as static agents/geometries to send to unity with the up_tree unity properties.
		do add_background_geometries(static_punctual_agent,up_tree);
	}
	
	
	//action that defines the different unity properties
	action define_properties {
		//define a unity_aspect called tree_aspect that will display in Unity the agents with the SM_arbres_001 prefab, with a scale of 2.0, no y-offset, 
		//a rotation coefficient of 1.0 (no change of rotation from the prefab), no rotation offset, and we use the default precision. 
		unity_aspect tree_aspect <- prefab_aspect("Prefabs/Visual Prefabs/Nature/PREFABS/Plants/SM_Arbre_001",2.0,0,1.0,0.0, precision);
		
		//define the up_tree unity property, with the name "tree", no specific layer, no interaction, and the agents location are not sent back 
		//to GAMA. 
		up_tree<- geometry_properties("tree", nil, tree_aspect, #no_interaction, false);
		
		// add the up_tree unity_property to the list of unity_properties
		unity_properties << up_tree;
		
		
		//define a unity_aspect called geom_aspect that will display the agents using their geometries, with a height of 10 meters, the gray color, and we use the default precision. 
		unity_aspect geom_aspect <- geometry_aspect(10.0, #gray, precision);
		
		//define the up_geom unity property, with the name "polygon", no specific layer, no interaction, and the agents location are not sent back 
		//to GAMA. 
		up_geom <- geometry_properties("polygon", nil, geom_aspect, #no_interaction, false);
		
		// add the up_geom unity_property to the list of unity_properties
		unity_properties << up_geom;
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
		display map {
			species static_geometry_agent;
			species static_punctual_agent;
		}
	}
}

//default Unity (VR) experiment that inherit from the SimpleMessage experiment
//The unity type allows to create at the initialization one unity_linker agent
experiment vr_xp parent:main autorun: false type: unity {
	//minimal time between two simulation step
	float minimum_cycle_duration <- 0.05;

	//name of the species used for the unity_linker
	string unity_linker_species <- string(unity_linker);
	
	//allow to hide the "map" display and to only display the displayVR display 
	list<string> displays_to_hide <- ["map"];
	


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
	
	//variable used to avoid to move too fast the player agent
	float t_ref;

		 
	output { 
		//In addition to the layers in the map display, display the unity_player and let the possibility to the user to move players by clicking on it.
		display displayVR parent: map  {
			species unity_player;
			event #mouse_down  {
				float t <- gama.machine_time;
				if (t - t_ref) > 500 {
					ask unity_linker {
						move_player_event <- true;
					}
					t_ref <- t;
				}
				
			}
		}
		
	} 
}