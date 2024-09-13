/**
* Name: DemoModelVR
* Simple demonstration of a single-player VR experience. In this demo, the player can see cars and motorcycles sent by GAMA. When a car or motorcycle is clicked,
* the vehicle is removed from the simulation. The player can also see blocks. If the player clicks on a block, it turns red and becomes a hot spot 
* (vehicles will try to drive near this hot spot). Finally, the player can see a tree (static_agent) and move it (grab).
* The tree's position will be updated accordingly in the GAMA simulation.
* It works with the Scene "Assets/Scenes/Single Player Game/Main Scene" from the Unity Template (Scenes to use: Startup Menu, IP Menu, Single Player Game/Main Scene).
* Author: Patrick Taillandier
* Author: Patrick Taillandier
* Tags: Unity, user interaction, single player, grab, ray interactor
*/
 
model DemoModelVR

import "DemoModel.gaml"

  
  

species unity_linker parent: abstract_unity_linker {
	list<point> init_locations <- [{50.0, 50.0}];
	string player_species <- string(unity_player);
	int min_num_players <- 1;
	int max_num_players <- 4; 
	

	bool do_send_world <- true; 
	
	unity_property up_car;
	unity_property up_moto;
	unity_property up_tree ;
	unity_property up_geom;
	
	
	init {
		do define_properties;
		do add_background_geometries(block,up_geom);
		do add_background_geometries(static_object,up_tree);
	}
	
	action define_properties {
		unity_aspect car_aspect <- prefab_aspect("Prefabs/Visual Prefabs/City/Vehicles/Car",30,0.2,1.0,-90.0, precision);
		up_car <- geometry_properties("car","car", car_aspect, #ray_interactable, false);
		unity_properties << up_car;
		
		
		unity_aspect moto_aspect <- prefab_aspect("Prefabs/Visual Prefabs/City/Vehicles/Scooter",30,0.2,1.0,-90.0, precision);
		up_moto <- geometry_properties("moto", "moto", moto_aspect,#ray_interactable, false);
		unity_properties << up_moto;
		
		unity_aspect tree_aspect <- prefab_aspect("Prefabs/Visual Prefabs/Nature/PREFABS/Plants/SM_Arbre_001",2.0,0,1.0,0.0, precision);
		up_tree<- geometry_properties("tree", "tree", tree_aspect, #grabable, true);
		unity_properties << up_tree;
		
		
		unity_aspect geom_aspect <- geometry_aspect(10.0, #gray, precision);
		up_geom <- geometry_properties("block", "selectable", geom_aspect, #ray_interactable, false);
		unity_properties << up_geom;
	}
	
	reflex send_agents {
		do add_geometries_to_send(simple_agentA,up_car);
		do add_geometries_to_send(simple_agentB,up_moto);
	}

	action add_to_send_parameter(agent player, map map_to_send) {
		map_to_send["hotspots"] <- (block where (each.is_hotspot)) collect string(int(each));
	}
	
	
	action remove_vehicle(string id) {
		agent ag <- (simple_agentA + simple_agentB) first_with (each.name = id) ;
		if (ag != nil) {
			ask ag {
				remove key: self from: myself.geometries_to_send;
				do die;
			}
		}
	}
	action update_hotspot(string id) {
		block b <- block first_with (each.name = id);
		
		if (b != nil) {
			ask b {
				if (not b.is_hotspot) {
					do become_hotspot;
				} else {
					do remove_hotspot;
				}
			}
			
		}
	}
}

//Defaut species for the player
species unity_player parent: abstract_unity_player{
	//allow to reduce the quantity of information sent to Unity - only the agents at a certain distance are sent
	float player_agents_perception_radius <- 0.0;
	
	//allow to not send to Unity agents that are to close (i.e. overlapping) 
	float player_agents_min_dist <- 0.0;
	
	float player_size <- 3.0;
	rgb color <- #blue;
	float cone_distance <- 10.0 * player_size;
	float cone_amplitude <- 90.0;
	float player_rotation <- 90.0;
	bool to_display <- true;
	
 
	aspect default { 
		if to_display {
			if (selected) {
				draw circle(player_size) at: location + {0, 0, 4.9} color: rgb(#blue, 0.5);
			}
			if file_exists("../images/headset.png")  {
				draw image("../images/headset.png")  size: {player_size, player_size} at: location + {0, 0, 5} rotate: heading - 90;
			
			} else {
				draw circle(player_size/2.0) at: location + {0, 0, 5} color: color ;
			}
			
			draw player_perception_cone() color: rgb(#red, 0.5);
		}			
	}
}


//Default xp with the possibility to move the player
experiment vr_xp parent: simple_simulation autorun: false type: unity  {
	float minimum_cycle_duration <- 0.03;
	string unity_linker_species <- string(unity_linker);
	list<string> displays_to_hide <- ["map"];
	
	float t_ref;

	action create_player(string id) {
		ask unity_linker {
			write "create player: " + id;
			do create_player(id);
		}
	}
	action remove_player(string id_input) {
		if (not empty(unity_player)) {
			ask first(unity_player where (each.name = id_input)) {
				do die;
			}
		}
	}
	 
	output { 
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