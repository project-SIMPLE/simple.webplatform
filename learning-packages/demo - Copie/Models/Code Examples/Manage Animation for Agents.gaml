/**
* Name: ManageAnimationForAgents
* Show how to manage the animation of an agent in Unity from GAMA. It works with the Scene "Assets/Scenes/Code Example/Manage Animation for Agents" from the Unity Template
* Author: Patrick Taillandier
* Tags: Unity, dynamic geometries/agents, animation
*/


model ManageAnimationForAgents

global {
	//unity properties that will be used for sending geometries/agents to Unity
	unity_property up_boy ;
	
 	init {
 		create boy_agent {
 			location <- {30,30};
 		}
 	}
 	
 	//action triggered by clicking on the screen to select the new target of the boy agent
 	action change_boy_target {
 		ask boy_agent {
			target <- #user_location;
			color <- #magenta;
		}
		
		//ask the unity linker to change the animation for the corresponding prefab. 
		//In this example, we just set the MoveSpeed parameter (defined in the animator of the boy prefab) to a value higher than 0.0 to trigger the move animation 
		ask unity_linker {
			do update_animation(
				players: unity_player as list, //list of players to send the information to
				geometries: boy_agent, //list of geometries/agennts to update the geometry to - these agents should have been sent to Unity using add_geometries_to_send
				parameters: ["MoveSpeed":: 1.0], //list of parameters to send to trigger animation - key(string): name of the parameter, value: either a float, an integer or a boolean
				triggers: []//list of triggers (string)
			);
		}
				
 	}

}


species boy_agent skills: [moving] {
	point target <- nil;
	float speed <- 0.1;
	rgb color <- #gray;
	
	//reflex that make the agent moves towards its target when this one is not nil
	reflex move_to_target when: target != nil {
		do goto target: target;
		
		//if arrived at destination
		if target = location {
			target <- nil;
			color <- #gray;
			//change its animation (for this prefab, set the MoveSpeed parameter to 0.0 to trigger the idle animation 
			ask unity_linker {
				do update_animation(
					players: unity_player as list,
					geometries: boy_agent,
					parameters: ["MoveSpeed":: 0.0]
				);
			}
		}
		
	}
	
	aspect default {
		draw circle(1) color: color border: #black;
	}
	
}


//Species that will make the link between GAMA and Unity. It has to inherit from the built-in species asbtract_unity_linker
species unity_linker parent: abstract_unity_linker {
	//name of the species used to represent a Unity player
	string player_species <- string(unity_player);

	//in this model, the agents location and heading will be sent to the Players at every step, so we set do_info_world to true
	bool do_send_world <- true;
	
	//initial location of the player
	list<point> init_locations <- [world.location];
	
	
	init {
		//define the unity properties
		do define_properties;
	}
	 
	
	//action that defines the different unity properties
	action define_properties {
		//define a unity_aspect called boy_aspect that will display in Unity the agents with the Boy prefab, with a scale of 2.0, a y-offset of 0.2, 
		//a rotation coefficient of 1.0 (no change of rotation from the prefab), a rotation offset of 90, and we use the default precision. 
		unity_aspect boy_aspect <- prefab_aspect("Prefabs/Visual Prefabs/Character/Boy",2.0,0.2,1.0,90.0,precision);
		
		//define the up_boy unity property, with the name "boy", no specific layer, the boy_aspect unity aspect, a collider, and the agents location are not sent back 
		//to GAMA. 
		up_boy<- geometry_properties("boy", nil, boy_aspect, #collider, false);
		
		// add the up_boy unity_property to the list of unity_properties
		unity_properties << up_boy;
		
	}
	
	//at every simulation step, when there is at least one player, send the boy agent with the unity property up_boy to Unity
	reflex send_agents when: not empty(unity_player) {
		do add_geometries_to_send(boy_agent,up_boy);
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
			species boy_agent;
		}
	}
}

//default Unity (VR) experiment that inherit from the SimpleMessage experiment
//The unity type allows to create at the initialization one unity_linker agent
experiment vr_xp parent:main autorun: false type: unity {
	//minimal time between two simulation step
	float minimum_cycle_duration <- 0.01;

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
	
	
	//action that sends an trigger to Unity to trigger an animation for the boy prefab
	action send_trigger(string trigger_name) {
		ask unity_linker {
			do update_animation(
				players: unity_player as list,
				geometries: boy_agent,
				triggers: [trigger_name]
			);	
		}
	}
	
	//variable used to avoid to move too fast the player agent
	float t_ref;

		 
	output { 
		//In addition to the layers in the map display, display the unity_player and let the possibility to the user to move the boy agent by clicking on the display, 
		//and triggering several animation using the keyboard (key: 'p', 'w', 'h').
		display displayVR parent: map  {
			species unity_player;
			event "p" {
				t_ref <- gama.machine_time;
				ask boy_agent {
					color <- #green;
					target <- nil;
				}
				do send_trigger("Pickup");
					
			}
			event "w" {
				t_ref <- gama.machine_time;
				ask boy_agent {
					color <- #yellow;
					target <- nil;
				}
				do send_trigger("Win");
			}
			event "h" {
				ask boy_agent {
					color <- #blue;
					target <- nil;
				}
				t_ref <- gama.machine_time;
				do send_trigger("Wave");
			}

			event #mouse_down  {
				float t <- gama.machine_time;
				if (t - t_ref) > 1000 and cycle > 0{
					ask world {
						do change_boy_target;
					}
					t_ref <- t;
				}
			}
		}
	} 
}