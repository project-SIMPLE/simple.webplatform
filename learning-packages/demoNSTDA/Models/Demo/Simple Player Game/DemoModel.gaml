/**
* Name: DemoModel
* Example of model using the UnityLink Template
* Author: Patrick Taillandier
* Tags: 
*/
model DemoModel
 

global {
	int nb_agentsA <- 100  min: 0 max: 5000 step: 1;
	int nb_agentsB <- 100 min: 0 max: 5000 step: 1;
	float cycle_duration <- 0.03 min: 0.0 max: 0.1 step: 0.01;
	float step <- 0.1 min: 0.1 max: 2.0 step: 0.1;
	int nb_blocks <- 10 min: 0 max: 10 step: 1.0;
	float block_size <- 5.0  min: 1.0 max: 10.0 step: 1.0;
	float distance_hostspot <- 10.0  min: 1.0 max: 20.0 step: 1.0;
	geometry free_place ;
	graph network;
	init {
		create static_object with:(location: {5, 50}) {
			taken_place <- rectangle(10.0, 100.0) at_location {5, 50};
		}
		
		if (nb_blocks > 0) {
			free_place <- copy(shape) - (block_size) ;
			ask static_object {
				free_place <- free_place - taken_place;
			}
			loop times: nb_blocks {
				if free_place = nil {break;}
				create block {
					shape <- square(block_size);
					location <- any_location_in(free_place);
					free_place <- free_place - (shape + 2.0);
				}
			} 
			
		}
		ask block {
			bounds <- (shape + distance_hostspot) inter free_place;
		}
		
		list<geometry> generated_lines <- generate_pedestrian_network([],[free_place],true,false,5,0.001,true,0.01,0.01,0.0,0.0);
		
		create pedestrian_path from: generated_lines  {
			do initialize bounds:[free_place] distance: min(10.0,(block closest_to self) distance_to self) masked_by: [block] distance_extremity: 1.0;
		}
		
		
		network <- as_edge_graph(pedestrian_path);
		
		ask pedestrian_path {
			do build_intersection_areas pedestrian_graph: network;
		}
		create simple_agentA number: nb_agentsA with: (location:any_location_in(free_place));
		create simple_agentB number: nb_agentsB with: (location:any_location_in(free_place));
		
	}
	
	
	
	 
}

species pedestrian_path skills: [pedestrian_road]{
	aspect default {
		draw shape  color: #red;
	}	
}

species block {
	rgb color <- #black;
	rgb color_hotspot <- #red;
	rgb color_hotspot_dist <- rgb(255,0,0.0,0.5);
	bool is_hotspot <- false;
	geometry bounds;
	
	user_command test_hotspot {
		if (not is_hotspot) {
			do become_hotspot;
		} else {
			do remove_hotspot;
		}
	}
	action update_hotspots {
		list<block> hotspots <- block where each.is_hotspot;
		if (empty(hotspots)) {
			ask simple_agentA + simple_agentB {
				my_hot_spot <- nil;
				bounds <- nil;
			}
		}
		else {
			ask simple_agentA + simple_agentB {
				my_hot_spot <- one_of(hotspots);
				bounds <- my_hot_spot.bounds;
				target <- any_location_in(free_place);
			}
		}
	}
	action become_hotspot {
		is_hotspot <- true;
		do update_hotspots;
	}
	action remove_hotspot {
		is_hotspot <- false;
		do update_hotspots;
	}
	aspect default {
		if (is_hotspot) {
			draw shape + distance_hostspot color: color_hotspot_dist;
		}
		draw shape color:is_hotspot ?color_hotspot : color ;
		
	}
}
 


species simple_agentA  skills: [pedestrian ] {
	rgb color <- #blue;
	block my_hot_spot;
	geometry bounds;
	point target;
	path my_path;
	
	init {
		obstacle_consideration_distance <-1.0;
		pedestrian_consideration_distance <-1.0;
		shoulder_length <- 2.0;
		avoid_other <- true;
		proba_detour <- 0.25;
			
		use_geometry_waypoint <- true;
		tolerance_waypoint<- 0.1;
		pedestrian_species <- [simple_agentA, simple_agentB];
		obstacle_species<-[block];
			
		pedestrian_model <- "simple";
		A_pedestrians_SFM <- 1.5;
		relaxion_SFM <- 2.0;
		gama_SFM <- 0.35;
		lambda_SFM <- 2.0;
		n_prime_SFM <- 3.0;
		n_SFM <- 2.0;
	}
	
	action choose_target(geometry bds) {
		target <- any_location_in(bds);
		
		if (free_place covers line([location, target])  ) {
			target <- any_location_in(bds);
		} else {
			loop while: (free_place covers line([location, target])) {
				target <- any_location_in(free_place);
			}
			
		}
	}
	
	
	reflex move  {
		if (final_waypoint = nil) {
			if (bounds != nil) {
				do choose_target(bounds);
			} else {
				do choose_target(free_place);
			}
			do compute_virtual_path pedestrian_graph:network target: target;
		}
		do walk ;
	}	
	
	aspect default {
		draw triangle(1) rotate:heading +90 color: color ;
	}
}

species simple_agentB parent: simple_agentA skills: [moving] {
		rgb color <- #green;
}

species static_object  {
	rgb color <- #green;
	int index <- 2;
	
	geometry taken_place;
	
	aspect default {
		draw cube(2) color: color ;
	}
}


experiment simple_simulation type: gui autorun: true{
	float minimum_cycle_duration <- cycle_duration;
	
	
	output {
		display map { 
			species pedestrian_path refresh: false;
		
			species simple_agentA;
			species simple_agentB;
			species static_object;
			species block;
		}
	}
}