/**
* Name: SendDEM
* Show how to send water data to Unity and modify it on the fly. It works with the Scene "Assets/Scenes/Code Example/Receive Water Data" from the Unity Template.
* The model simulates a flood in a river and sent to Unity the water area with water material. In addition, a DEM is used a background.
*  
* 
* Author: Patrick Taillandier
* Tags: Unity, Water, DEM, grid, field, Terrain
*/


model SendWater

global {
	
	//the dem used for this model
	grid_file dem_grid_file <- grid_file("../../includes/dem_water_level.asc");

	grid_file dem_altitude_grid_file <- grid_file("../../includes/altitude_water_level.asc");

	field dem <- field(grid_file("../../includes/dem_river.asc"));


	geometry shape <- envelope(dem_grid_file);
 	
 	
 	//propoerty used for the water
 	unity_property up_water ;
 	
 	//height increased/drecreased with the R/T events 	
 	float added_height <- 2.0 #m;
	
	//max height for the ground
	float max_value <- 100.0;
	
	
	//global level of water in the river
	float global_water_level <- 1.5 min: 1.5;
	
	
	int cycle_ref <- 0 ;
	
	init {
		//set the altitude of each cell 
		ask cell {
			 altitude <- bands[1];
		}
		
	}
	
	
	//add water in the river and compute its dispersion - a set a water is created from this computing representing the area where the level of water is higher than 0.5m
	action add_water  {
		global_water_level <- cycle_ref < 40 ?  global_water_level + 0.1 : global_water_level - 0.1  ;
		ask cell {
			do add_water(global_water_level);
		}
		list<cell> water_cells <- cell where (each.water_level > 0.5);
		if empty(water_cells) {
			ask water {do die;}
		} else {
			geometry g <- union (water_cells collect each.shape_union );
		
			if (g != nil) {
				ask water {do die;}
				create water from: g.geometries collect (each simplification 1.0);
			
			}
		}	
		cycle_ref <- cycle_ref + 1;
		if (cycle_ref mod 85)= 0 {
			cycle_ref <- 0;
		}
	}
	
	
	reflex add_water_reflex when: every(10#cycle) {
		//add the water and compute the water dispersion ("water" agent)
		do add_water;
		
		//if there is at least a player, send the geometries of the water agents with the up_water Unity property
		if not empty(water) and not empty(unity_player){
			ask unity_linker {
				//add the geometry of the water agents to the geometry to send - add a z offset correspoding to the level of water.
				do add_geometries_to_send(water collect (each.shape at_location {each.location.x,each.location.y, global_water_level}),up_water);
				
				//force the action to send the world (and send the current message) as the "do_send_world" to false to just send the world information at the right moment.
				do send_world;
				do send_current_message;
			}
		}
	}
}


//agent representing the water area
species water {
	aspect default {
		draw shape color: #blue;
	}
}



//grid initiliazed by the dem_grid_file and the altitude file
grid cell files:[dem_grid_file, dem_altitude_grid_file] neighbors: 4{
	
	//the altitude correspond to the min level of water in the river that is necessary to have water on this cell
	float altitude;
	
	//current level of water on the cell
	float water_level <- 0.0 min: 0.0 ;
	
	//just used for the computation of the geometries of the water agents
	geometry shape_union <- shape + 0.1;
	
	action add_water(float wl)  {
		water_level <- wl - altitude;
	}	
}


//Species that will make the link between GAMA and Unity. It has to inherit from the built-in species asbtract_unity_linker
species unity_linker parent: abstract_unity_linker {
	//name of the species used to represent a Unity player
	string player_species <- string(unity_player);

	//in this model, the agents location and heading will not be sent to the Players at every step, so we set do_info_world to false
	bool do_send_world <- false;
	
	//initial location of the player - center of the world
	list<point> init_locations <- [world.location];
	 
	 
	 	
	init {
		//define the unity properties
		do define_properties;
		
	
	}
	 
	
	//action that defines the different unity properties
	action define_properties {
		//define a unity_aspect called water_aspect that will display in Unity the agents from its geometry, with a height of 1m, the material "Water Material", the white color, and the default precision
		unity_aspect water_aspect <- geometry_aspect(1.0, "Materials/Water/Water Material",#white, precision);
		
		//define the up_water unity property, with the name "water", no specific layer, the water_aspect unity aspect, no interaction, and the agent location is not sent back 
		//to GAMA. 
		up_water<- geometry_properties("water", nil, water_aspect, #no_interaction,false);
		
		// add the up_water unity_property to the list of unity_properties
		unity_properties << up_water;
		
		
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
	
	//offset added to the player vizualisation.
	float z_offset <- 10.0;
	
	//default aspect to display the player as a circle with its cone of vision
	aspect default {
		if to_display {
			if selected {
				 draw circle(player_size) at: location + {0, 0, z_offset} color: rgb(#blue, 0.5);
			}
			draw circle(player_size/2.0) color: color  at: location + {0, 0,z_offset} ;
			draw player_perception_cone() color: rgb(color, 0.5)  ; 
		}
	}
}
experiment main type: gui {
		float minimum_cycle_duration <- 0.01;
	
	output synchronized: true{
		display map type: 2d {
			mesh cell grayscale: true triangulation: true smooth: true  ;
			species water;
			
		}
	}
}

//default Unity (VR) experiment that inherit from the SimpleMessage experiment
//The unity type allows to create at the initialization one unity_linker agent
experiment vr_xp parent:main autorun: false type: unity {
	//minimal time between two simulation step
	float minimum_cycle_duration <- 0.03;

	//name of the species used for the unity_linker
	string unity_linker_species <- string(unity_linker);
	
	//allow to hide the "map" display and to only display the displayVR display 
	list<string> displays_to_hide <- ["map"];
	
	
	
	//action called by the middleware when a player connects to the simulation
	action create_player(string id) {
		ask unity_linker {
			do create_player(id);
			
			//after creating the player, GAMA sends to the player the initial value of the DEM
			do update_terrain (
					player:last(unity_player),  //player concerned 
					id:"Dem",  //name of the Terrain in Unity
					field:dem, //it is possible to send the grid either as a field or as a matrix
					resolution:65, //resolution of the target Terrain in Unity. Ideally, the resolution of the field/matrix should be the same as this one
					max_value:max_value //optional : max possible of the grid - if not defined, GAMA will set it with the max value in the field/matrix
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
		//In addition to the layers in the map display, display the unity_player .
		display displayVR parent: map  {
			species unity_player;
			
			//increase the height of a cell when cliking on "R"
		
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