/**
* Name: sendGeometriesToUnity
* Author: Patrick Taillandier
* Description: A simple model allow to send geometries to Unity. To be used with the "Load geometries from GAMA"
* Tags: gis, shapefile, unity, geometry, 
*/
model sendGeometriesToUnity


global {
	//unity properties that will be used for sending geometries/agents to Unity
	unity_property up_road ;
	unity_property up_building;
	unity_property up_river;
	file river_shapefile <- file("../../includes/river.shp");
	file shape_file_roads <- file("../../includes/road.shp");
	file buildings_shapefile <- file("../../includes/buildings.shp");
	file shape_file_evacuation <- file("../../includes/evacuation_point.shp");
	
	shape_file bounds_shape_file <- shape_file("../../includes/QBBB.shp");
	
	geometry shape <- envelope(bounds_shape_file);
	
	init {
 		create road from: clean_network(shape_file_roads.contents, 0.0, false, true) ;
		create building from: buildings_shapefile ; 
		create river from: river_shapefile ; 
		 		
 		
 	}

}

species river {
	aspect default{ 
		draw shape color: #blue;
	}
}

species road {
	int lanes;
	aspect default{ 
		draw shape + 5 color: #black;
	}
}
species building {
	string type;
	aspect default{ 
		draw shape color: #gray ;
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
		
		do add_background_geometries(road collect (each.shape + 5.0),up_road);
		do add_background_geometries(building,up_building);
		do add_background_geometries(river,up_river);
	}
	
	
	//action that defines the different unity properties
	action define_properties {
		unity_aspect road_aspect <- geometry_aspect(0.1, #black, precision);
		
		//define the up_tree unity property, with the name "tree", no specific layer, no interaction, and the agents location are not sent back 
		//to GAMA. 
		up_road<- geometry_properties("road", nil, road_aspect, #no_interaction, false);
		
		// add the up_tree unity_property to the list of unity_properties
		unity_properties << up_road;
		
		
		unity_aspect building_aspect <- geometry_aspect(10.0, #gray, precision);
		
		//define the up_geom unity property, with the name "polygon", no specific layer, no interaction, and the agents location are not sent back 
		//to GAMA. 
		up_building <- geometry_properties("building", nil, building_aspect, #no_interaction, false);
		
		// add the up_geom unity_property to the list of unity_properties
		unity_properties << up_building;
		
		unity_aspect river_aspect <- geometry_aspect(0.1, #blue, precision);
		
		//define the up_geom unity property, with the name "polygon", no specific layer, no interaction, and the agents location are not sent back 
		//to GAMA. 
		up_river <- geometry_properties("river", nil, river_aspect, #no_interaction, false);
		
		// add the up_geom unity_property to the list of unity_properties
		unity_properties << up_river;
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
			species river;
			species building;
			species road;
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