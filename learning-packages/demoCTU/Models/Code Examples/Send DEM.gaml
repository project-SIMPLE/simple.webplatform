/**
* Name: SendDEM
* Show how to send a grid/matrix to Unity and modify it on the fly. It works with the Scene "Assets/Scenes/Code Example/Receive DEM Data" from the Unity Template.
* In this model, a DEM is loaded from GAMA as soon as a player logs on. The player, who is in the centre of a crater at the start of the game, can then move around 
* this DEM and catch/throw a ball whose physics are managed by Unity. From GAMA, you can dynamically increase the height of a cell by pressing 'R'. 
* The cell whose height is increased will be the one where the mouse is located. Similarly, you can decrease the height of a cell by pressing 'T'. 
* The player in the VR headset will automatically see the DEM changed in the game. 
* 
* Author: Patrick Taillandier
* Tags: Unity, DEM, grid, field, Terrain
*/


model SendDEM

global {
	
	//the dem used for this model
	grid_file mnt_grid_file <- grid_file("../../includes/dem.asc");

	geometry shape <- envelope(mnt_grid_file);
 	
 	
 	//propoerty used for the ball
 	unity_property up_sphere ;
 	
 	//height increased/drecreased with the R/T events 	
 	float added_height <- 2.0 #m;
	
	//max height for the ground
	float max_value <- 100.0;
	
	
	init {
		//create a sphere agent (ball)
		create sphere_ag with:(location:{20,20,70});
	}
	
	
	//action to increase/decrease the height of a cell
	action change_height(bool increase) {
		cell c <- cell(#user_location) ;
		if (c != nil) {
			//increase/decrease the height of the cell located at user_location (mouse pointer)
			ask c {
				grid_value <-grid_value + (increase ? added_height : -added_height);
				grid_value <- max(0, min(max_value,grid_value));
			}
			
			//ask the unity linker to send the modification of the dem to Unity
			ask unity_linker {
				do set_terrain_values(
					player:last(unity_player), //player concerned 
					id:"Dem",  //name of the Terrain in Unity
					matrix: {1,1} matrix_with c.grid_value, //matrix containing the new values - in this example only the height of one cell (c) is modified
					index_x : c.grid_x, //index x (column) of the matrix in the total grid
					index_y : c.grid_y //index y (row) of the matrix in the total grid
				);
			}
		}
	}
}

//sphere agent represented by a sphere in GAMA
species sphere_ag {
	aspect default {
		draw sphere(1) color: #magenta;
	}
}

//grid initiliazed by the mnt_grid_file
grid cell file: mnt_grid_file ;

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
		
		//add the sphere_ag agent as static geometry to send to unity with the up_sphere unity properties.
		do add_background_geometries(sphere_ag,up_sphere);
	
	}
	 
	
	//action that defines the different unity properties
	action define_properties {
		//define a unity_aspect called sphere_aspect that will display in Unity the agents with the SphereRigidBody prefab, with a scale of 1.0, no y-offset, 
		//a rotation coefficient of 1.0 (no change of rotation from the prefab), no rotation offset, and we use the default precision. 
		unity_aspect sphere_aspect <- prefab_aspect("Prefabs/Visual Prefabs/Basic shape/SphereRigidBody",1.0,0.0,1.0,0.0, precision);
		
		//define the up_sphere unity property, with the name "sphere_ag", no specific layer, the sphere_aspect unity aspect, grabable, and the agent location is sent back 
		//to GAMA. 
		up_sphere<- geometry_properties("sphere_ag", nil, sphere_aspect, #grabable, true);
		
		// add the up_sphere unity_property to the list of unity_properties
		unity_properties << up_sphere;
		
		
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
	output {
		display map type: 3d{
			mesh cell grayscale: true triangulation: true smooth: true  ;
			species sphere_ag;
		}
	}
}

//default Unity (VR) experiment that inherit from the SimpleMessage experiment
//The unity type allows to create at the initialization one unity_linker agent
experiment vr_xp parent:main autorun: false type: unity {
	//minimal time between two simulation step
	float minimum_cycle_duration <- 0.1;

	//name of the species used for the unity_linker
	string unity_linker_species <- string(unity_linker);
	
	//allow to hide the "map" display and to only display the displayVR display 
	list<string> displays_to_hide <- ["map"];
	
	
	
	//action called by the middleware when a player connects to the simulation
	action create_player(string id) {
		field f <- field(matrix(cell));
		ask unity_linker {
			do create_player(id);
			
			//after creating the player, GAMA sends to the player the initial value of the DEM
			do update_terrain (
					player:last(unity_player),  //player concerned 
					id:"Dem",  //name of the Terrain in Unity
					field:f, //it is possible to send the grid either as a field or as a matrix
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
			event "r" {
				ask world {
					do change_height(true);
				}	
			}
			
			
			//decrease the height of a cell when cliking on "T"
			event "t" {
				ask world {
					do change_height(false);
				}	
			}
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