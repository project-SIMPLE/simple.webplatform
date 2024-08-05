/**
* Name: Race_to_token_model_VR
* Simple demonstration of a multi-player VR experience. In this demo, the players have to collect as much as possible token (treasure chest) in a maze.
* The player who collected the highest number of tokens is the winner.  
* It works with the Scene "Assets/Scenes/Multi Player Game/Main Scene" from the Unity Template (Scenes to use: Startup Menu, IP Menu, Multi Player Game/Main Scene, End of Game Menu) 
* Author: Patrick Taillandier
* Tags: Unity, user interaction, single player, grab, ray interactor
*/

model Race_to_token_model_VR
 
import "Race.gaml"


species unity_linker parent: abstract_unity_linker {
	string player_species <- string(unity_player);
	list<point> init_locations <- random_loc();
	
	int nb_players <-1;
	int max_num_players  <- nb_players;
	int min_num_players  <- nb_players;

	unity_property up_wall;
	unity_property up_token;
	unity_property up_ghost;
	unity_property up_lg;
	unity_property up_slime;
	unity_property up_turtle;
	
	map<string,int> score_players;
	

	init {
		do define_properties;
		do add_background_geometries(wall,up_wall);
		player_unity_properties <- [ up_lg,up_turtle, up_slime, up_ghost ];
		
	}
	list<point> random_loc {
		list<point> locs ;
		list<cell> free_cells <- list(cell);
		ask token {
			free_cells >> cell(location);
		}
		loop times: 4 {
			cell c <- one_of(free_cells);
			locs << c.location;
			free_cells >> c;
		}
		return locs;
	} 
	
	map<string, int> rank {
		map<string, int> ranking;
		loop p over: unity_player {
			if (not (p.name in score_players.keys)) {
				score_players[p.name] <- 0;
			}
		}
		map<int, list<unity_player>> pls <- unity_player group_by score_players[each.name];
		list<int> scs <- pls.keys sort_by (-1 * each);
		loop i from: 0 to: length(scs) -1 {
			 loop p over: pls[scs[i]] {
			 	ranking[p.name] <- i+1;
			 }
		}
		return ranking;
	}
	
	
	action add_to_send_world(map map_to_send) {
		if not empty(unity_player) {
			map_to_send["players"] <- unity_player collect each.name;
			map<string, int> ranking <- rank();
			map_to_send["ranking"] <- unity_player collect ranking[each.name];
			map_to_send["numTokens"] <- length(token);
		}	
	}
	
	reflex end_of_game when: empty(token) {
		map<string, int> ranking <- rank();
		string mes <- "";
		loop i from: 1 to: int(max(ranking.values)) {
			list<string> pls <- ranking.keys where (ranking[each] = i);
			loop p over: pls {
				mes <- mes + "\n  " + i + ") " + p + " - score: " + score_players[p];
			}
		}
		write mes;
		do end_of_game(mes);
	}
	
	
	reflex send_agents {
		do add_geometries_to_send(token,up_token);
	}
	
	action define_properties {
		unity_aspect wall_aspect <- geometry_aspect(4.0,#black,precision);
		up_wall <- geometry_properties("wall","",wall_aspect,#collider,false);
		unity_properties << up_wall;

		unity_aspect token_aspect <- prefab_aspect("Prefabs/Visual Prefabs/Chest/Death_Chest",1,0.63,1.0,0.0, precision);
		up_token <- geometry_properties("token","",token_aspect,#ray_interactable,false);
		unity_properties << up_token;

		unity_aspect ghost_aspect <- prefab_aspect("Prefabs/Visual Prefabs/Character/Ghost",2.0,0.0,-1.0,90.0,precision);
		up_ghost <- geometry_properties("ghost","",ghost_aspect,new_geometry_interaction(true, false,false,[]),false);
		unity_properties << up_ghost; 
		
		unity_aspect slime_aspect <- prefab_aspect("Prefabs/Visual Prefabs/Character/Slime",2.0,0.0,-1.0,90.0,precision);
		up_slime <- geometry_properties("slime","",slime_aspect,new_geometry_interaction(true, false,false,[]),false);
		unity_properties << up_slime; 
		
		unity_aspect lg_aspect <- prefab_aspect("Prefabs/Visual Prefabs/Character/LittleGhost",2.0,0.0,-1.0,90.0,precision);
		up_lg <- geometry_properties("little_ghost","",lg_aspect,new_geometry_interaction(true, false,false,[]),false);
		unity_properties << up_lg; 
		
		unity_aspect turtle_aspect <- prefab_aspect("Prefabs/Visual Prefabs/Character/TurtleShell",2.0,0.0,-1.0,90.0,precision);
		up_turtle <- geometry_properties("turtle","",turtle_aspect,new_geometry_interaction(true, false,false,[]),false);
		unity_properties << up_turtle; 
	}
	
	action remove_token(string id, string player) {
		token ag <- token first_with (each.name = id) ;
		if (ag != nil) {
			ask ag {
				remove key: self from: myself.geometries_to_send;
				do die;
			}
			if not(player in score_players.keys ) {
				score_players[player] <- 0;
			}
			score_players[player] <- score_players[player] + 1;
			
		}
	}
	
	
}

species unity_player parent: abstract_unity_player{
	float player_size <- 1.0;
	rgb color <- [#red,#blue,#green,#yellow][length(unity_player)] ;
	float cone_distance <- 10.0 * player_size;
	float cone_amplitude <- 90.0;
	float player_rotation <- 90.0;
	bool to_display <- true;
	
	
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

experiment vr_xp parent:begin_race autorun: false type: unity {
	float minimum_cycle_duration <- 0.1;
	string unity_linker_species <- string(unity_linker);
	list<string> displays_to_hide <- ["map"];
	float t_ref;

	action create_player(string id) {
		ask unity_linker {
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
		 display map_VR parent:map{
			 species unity_player;
			 event #mouse_down{
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
