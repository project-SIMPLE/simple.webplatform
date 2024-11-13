model Flood_VR

import "Flooding Model.gaml"

global { 
	

	action repair_dyke_with_unity_global(string dyke_name)
	{
		ask dyke where (each.name = dyke_name)
		{
			drowned <- false;
			do build();
		}
	}
	
	action break_dyke_with_unity_global(string dyke_name)
	{
		ask dyke where (each.name = dyke_name)
		{
			drowned <- true;
			do break();
		}
	}

	action remove_dyke_with_unity_global (string dyke_name) {
		ask dyke where (each.name = dyke_name) {
			do die;
		}

	}
	

}

species unity_linker parent: abstract_unity_linker {
	string player_species <- string(unity_player);
	int max_num_players  <- -1;
	int min_num_players  <- 10;
	list<point> init_locations <- define_init_locations();
	unity_property up_people;
	unity_property up_dyke;
	unity_property up_water;

	action add_to_send_world(map map_to_send) {
		map_to_send["score"] <- int(100*evacuated/nb_of_people);
	}
	list<point> define_init_locations {
		return [world.location + {0,0,100}];
	}

	list<float> convert_string_to_array_of_float(string my_string) {
    	return (my_string split_with ",") collect float(each);
	}
	
	action action_management_with_unity(string unity_start_point, string unity_end_point) {
		list<float> unity_start_point_float <- convert_string_to_array_of_float(unity_start_point);
		list<float> unity_end_point_float <- convert_string_to_array_of_float(unity_end_point);
		point converted_start_point <- {unity_start_point_float[0], unity_start_point_float[1], unity_start_point_float[2]};
		point converted_end_point <- {unity_end_point_float[0], unity_end_point_float[1], unity_end_point_float[2]};
		float price <- converted_start_point distance_to (converted_end_point) with_precision 1;
		geometry l <- line([converted_start_point, converted_end_point]);
		create dyke with: (shape: line([converted_start_point, converted_end_point]));
		do after_creating_dyke;
		do send_message players: unity_player as list mes: ["ok_build_dyke_with_unity":: true];
		ask experiment {
			do update_outputs(true); 
		}
		
	}
	
	action after_creating_dyke {
			list<geometry> geoms <- dyke collect ((each.shape + 5.0) at_location {each.location.x, each.location.y, 10.0});
			loop i from:0 to: length(geoms) -1 {
				geoms[i].attributes['name'] <- dyke[i].name;
			}
				
			do add_geometries_to_send(geoms,up_dyke);	
			do add_geometries_to_send(river,up_water);
			
			do send_world;
			do send_current_message;
	}
	

	action repair_dyke_with_unity(string dyke_name)
	{
			return world.repair_dyke_with_unity_global(dyke_name);
	}
	
	action break_dyke_with_unity(string dyke_name)
	{
			return world.break_dyke_with_unity_global(dyke_name);
	}
	
	action remove_dyke_with_unity(string dyke_name)
	{
			return world.remove_dyke_with_unity_global(dyke_name);
	}
	
	action pause_with_unity
	{
		ask world
		{
			do pause;
		}
	}
	
	action resume_with_unity
	{
		ask world
		{
			do resume;
		}
	}
	
	action end_with_unity
	{
		ask world
		{
			do die;
		}
	}
	
	action start_simulation_with_unity
	{
		ask world
		{
			do start_flooding;
		}
	}

	
	init {
		//define the unity properties
		do define_properties;
		
	}
	
	//action that defines the different unity properties
	action define_properties {
		
		//define a unity_aspect called tree_aspect that will display in Unity the agents with the SM_arbres_001 prefab, with a scale of 2.0, no y-offset, 
		//a rotation coefficient of 1.0 (no change of rotation from the prefab), no rotation offset, and we use the default precision. 
		unity_aspect car_aspect <- prefab_aspect("Prefabs/Visual Prefabs/City/Vehicles/Car",100,0.2,1.0,-90.0, precision);
		unity_aspect dyke_aspect <- geometry_aspect(40.0, "Materials/Dike/Dike", rgb(0, 0, 0, 0.0), precision);
		unity_aspect water_aspect <- geometry_aspect(40.0, "Materials/MAT_LOW_POLY_SHADER_TEST", rgb(0, 0, 0, 0.0), precision);
 	
		//define the up_car unity property, with the name "car", no specific layer, the car_aspect unity aspect, no interaction, and the agents location are not sent back 
		//to GAMA. 
		up_people<- geometry_properties("car", nil, car_aspect, #no_interaction, false);
		up_dyke <- geometry_properties("dyke", "dyke", dyke_aspect, #collider, false);
		up_water <- geometry_properties("water", nil, water_aspect, #no_interaction,false);
		// add the up_tree unity_property to the list of unity_properties
		unity_properties << up_people;
		unity_properties << up_dyke;
		unity_properties << up_water;
	}
	
	reflex send_agents when:  not empty(unity_player) {
		do add_geometries_to_send(people where (each.my_path != nil),up_people);
		
		if (not empty(dyke)) {
			list<geometry> geoms <- dyke collect ((each.shape + 5.0) at_location {each.location.x, each.location.y, 10});
			loop i from:0 to: length(geoms) -1 {
				geoms[i].attributes['name'] <- dyke[i].name;
				
			}
				
			do add_geometries_to_send(geoms ,up_dyke);	
		}
		do add_geometries_to_send(river,up_water);
		
		
	}
	

 
}

species unity_player parent: abstract_unity_player{
	float player_size <- 50.0;
	rgb color <- #red;	
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

experiment vr_xp parent:"Base" autorun: false  type: unity {

	float minimum_cycle_duration <- 0.05;
	string unity_linker_species <- string(unity_linker);
	//list<string> displays_to_hide <- ["map"];
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
	
	action restart {
		ask simulation {do die;}
		create simulation;
	}

	output {
		 display map_VR type: 3d background: #dimgray{
		 	
			camera 'default' location: {1419.7968,8667.7995,4069.6711} target: {1419.7968,4303.6116,0.0};
		 	species river transparency: 0.7 {
				draw shape color: #lightseagreen depth: 10 at: location - {0, 0, 5};
			}
			species road {
				draw shape color: drowned ? (#cadetblue) : color depth: height border: drowned ? #white:color;
			}
		 	species buildings {
		 		draw shape color: drowned ? (#cadetblue) : color depth: height * 2 border: drowned ? #white:color;	
		 	}
		 	species dyke {
		 		draw shape + 5 color: drowned ? (#cadetblue) : color depth: height * 2 border: drowned ? #white:color;	
			}
			species people {
				draw sphere(18) color:#darkseagreen;
			}
			species evacuation_point;


		 	
		 	
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
