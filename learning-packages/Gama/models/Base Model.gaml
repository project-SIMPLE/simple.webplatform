model BaseModel

global {
	// Data files 
	grid_file DEM_grid_file <- grid_file("../includes/DEM.tif");
	file river_shapefile <- file("../includes/river.shp");
	file shape_file_roads <- file("../includes/road.shp");
	file buildings_shapefile <- file("../includes/buildings.shp");
	file shape_file_evacuation <- file("../includes/evacuation_point.shp");
	shape_file bounds_shape_file <- shape_file("../includes/QBBB.shp");
	file my_csv_file <- csv_file("../includes/FLoodDataH.csv"); 
	//
	geometry shape <- envelope(bounds_shape_file);
	bool height_propagation <- false;
	map<date, list<float>> data_map;
	float step <- 1 #mn;
	date current_date <- #now;
	int nb_of_people <- 500;
	int casualties <- 0;
	int evacuated <- 0;
	int roaddie <- 0 update: length(road where (each.drowned = true));
	int buildingdie <- 0 update: length(building where (each.drowned = true));
	string the_alert_strategy <- "CLOSEST";
	graph<geometry, geometry> road_network;
	graph<geometry, geometry> road_network_usable;
	map<road, float> new_weights;
	graph<geometry, geometry> river_network;
	list<cell> current_cells;
	list<cell> done;
	int action_type <- -1;
	float budget;
	float score;
	float limitscore <- 3200000000.0;
	float budget_year <- 3000.0;
	bool need_to_recompute_graph <- false;

	string PLAYER_TURN <- "PLAYER TURN";
	string SIMULATION <- "SIMULATION";
	string stage <- PLAYER_TURN;
	list<float> flood_coefficient <- [0.3, 0.8, 0.2];
	int index_flood <- 0;
	float current_coeff;

	bool ok_build_dyke <- true;
	bool ok_build_dyke_with_unity <- true;

	bool update_drowning <- false update: true;
	float global_water_level <- 1.5 min: 1.5;

	reflex RUN_SIMULATION when: stage = SIMULATION {
		if (every(#h)) {
			if (current_date in data_map.keys) {
				if need_to_recompute_graph {
					new_weights <- road as_map (each::each.shape.perimeter * (each.drowned ? 3.0 : 1.0));
					road_network_usable <- as_edge_graph(road where not each.drowned);
				}

				do add_water;
			} else {
				stage <- PLAYER_TURN;
				index_flood <- index_flood + 1;
				do update_data_map;
				do start_player_turn;
				do pause;
			}

		}
	}

	float update_score_global (float diff_value) {
		return score + diff_value;
	}

	float update_budget_global (float diff_value) {
		return budget + diff_value;
	}

	action start_player_turn {
		budget <- budget_year;
		score <- budget;
		ask cell {
			flooding_level <- 0.0;
			color <- #white;
		}
		create people number: nb_of_people {
			location <- any_location_in(one_of(building));
		}
		ask experiment {
			do update_outputs;
		}
	}

	action start_simulation {
		if (length(flood_coefficient) > index_flood) {
			ask building {
				drowned <- false;
				color <- one_of (#orange, darker(#orange), #brown);
			}
			ask road {
				drowned <- false;
				color <- #gray;
			}
			current_coeff <- flood_coefficient[index_flood];
			stage <- SIMULATION;
			do compute_height_propagation;
			do resume;
		} 
	}

	init {
		create building from: buildings_shapefile;
		create road from: clean_network(shape_file_roads.contents, 0.0, false, true);
		road_network <- as_edge_graph(road);
		road_network_usable <- as_edge_graph(road);
		river_network <- as_edge_graph(river_shapefile);
		new_weights <- road as_map (each::each.shape.perimeter);
		list<building> all_buildings <- list(building);
		create evacuation_point from: shape_file_evacuation;
		create river from: river_shapefile;
		matrix matrix_data <- matrix(my_csv_file);
		loop i from: 1 to: matrix_data.rows - 1 {
			list<string> d <- matrix_data[0, i] split_with " ";
			list<string> dd <- d[0] split_with "/";
			list<string> dt <- d[1] split_with ":";
			date date_gama <- date([int(dd[2]), int(dd[1]), int(dd[0]), int(dt[0]), int(dt[1]), 0]);
			data_map[date_gama] <- [float(matrix_data[5, i])];
		}
		starting_date <- first(data_map.keys);
		do init_water;
		do start_player_turn;
		do start_simulation;
		
	}

	action update_data_map {
		float s <- current_date - first(data_map.keys);
		list<date> previous_dates <- copy(data_map.keys);
		loop d over: previous_dates {
			list<float> v <- data_map[d];
			data_map[d add_seconds s] <- v;
			remove key: d from: data_map;
		}
	}

	reflex notification when: score >= limitscore {
	//	do tell("You passed the level!");
		do die;
	}

	action compute_height_propagation {
		current_cells <- cell overlapping (river[0]);
		ask cell {
			dyke_altitude <- 0.0;
		}
		ask dyke where not each.is_broken {
			ask cell overlapping (shape + width) {
				dyke_altitude <- (myself.height);
			}
		}
		ask building {
			ask cell overlapping shape {
				dyke_altitude <- max(dyke_altitude, (myself.height));
			}
		}
		ask current_cells {
			altitude <- grid_value + dyke_altitude;
		}
		done <- copy(current_cells);
		loop while: not empty(current_cells) {
			loop c over: copy(current_cells) {
				current_cells >> c;
				done << c;
				loop cn over: c.neighbors {
					if not (cn in done) and not (cn in current_cells) {
						current_cells << cn;
					}
					cn.altitude <- max(cn.grid_value + cn.dyke_altitude, min(c.altitude, cn.altitude));
				}
			}
		}
	}

	action init_water {
		ask cell overlapping river[0] {
			is_river <- true;
		}
	}

	action add_water {
		update_drowning <- true;
		bool need_recomputation <- false;
		matrix matrix_data <- matrix(my_csv_file);
		float water_level <- data_map[current_date][0];
		ask cell {
			flooding_level <- water_level - altitude;
			if flooding_level > 0.0 {
				if dyke_altitude > 0.0 {
					dyke_altitude <- 0.0;
					ask dykes where not (each.is_broken) {
						is_broken <- true;
						need_recomputation <- true;
					}
				}
				float val <- 255 * (1 - flooding_level / 1.0);
				color <- rgb(val, val, 255);
			}
		}
		if need_recomputation {
			do compute_height_propagation;
		}
	} 
}

species evacuation_point {

	aspect default {
		draw triangle(50) color: #red;
	}

}

species river {
	reflex when: every(5#mn) and cycle > 20 {
		shape <- union((cell where (each.flooding_level > 0.2)) collect each.shape_union) simplification 0.1;
	}
	aspect default {
		draw shape color: #blue border: #lightgray;
	}
}

species road {
	int lanes;
	bool drowned <- false;
	float height <- 0.5;
	rgb color <- #gray;
	list<cell> my_cells;

	init {
		my_cells <- cell overlapping self;
	}

	reflex check_drowning when: not drowned and update_drowning {
		ask my_cells where (each.flooding_level > 0.5) // Kiểm tra a_cell không phải là nil
		{
			myself.drowned <- true;
			myself.color <- #red;
			need_to_recompute_graph <- true;
			break;
		}
	}

	aspect default {
		draw shape + 1 color: color;
	}

}

species dyke {
	float height <- 10.0;
	bool is_broken <- false;
	float width <- 10.0;

	init {
		ask cell overlapping self {
			dykes << myself;
		}
	}

	aspect default {
		draw shape + width depth: height color: is_broken ? #red : #green;
	}

}

species building {
	float height <- 5.0 + rnd(30.0) ;
	rgb color <- one_of (#orange, darker(#orange), #brown);
	bool drowned <- false;
	list<cell> my_cells;

	init {
		my_cells <- cell overlapping self;
	}

	reflex check_drowning when: not drowned and update_drowning {
		ask my_cells where (each.flooding_level > 1.0) {
			myself.drowned <- true;
			myself.color <- #red;
			score <- world.update_score_global(-5.0);
			break;
		}
	}

	aspect default {
		draw shape color: color;
	}
}

species people skills: [moving] {
	float height_pp <- 1.7 #m;
	bool boat <- false;
	bool alerted <- false;
	point target <- nil;
	float perception_distance;
	float speed <- 0.5 #km / #h;
	path my_path;

	reflex become_alerted when: not alerted and flip(0.01) {
		alerted <- true;
	}

	reflex alert_target when: alerted {
		if target = nil {
			switch the_alert_strategy {
				match "RANDOM" {
					target <- (one_of(evacuation_point)).location;
				}
				match "CLOSEST" {
					using (topology(road_network_usable)) {
						evacuation_point ep <- (evacuation_point closest_to self);
						target <- ep.location;
					}
				}
			}
			my_path <- road_network_usable path_between (location, target);
		}

		if my_path != nil {
			do follow(path: my_path, move_weights: new_weights);
			if (location = target) {
				score <- world.update_score_global(float(100));
				evacuated <- evacuated + 1;
				target <- nil;
				do die;
			} }
		}

	reflex check_drowning {
		cell a_cell <- cell(location);
		if (a_cell != nil and a_cell.flooding_level > 0.2 and flip(0.5)) {
			casualties <- casualties + 1;
			score <- world.update_score_global(float(-10));
			do die;
		}
	}

	aspect default {
		draw circle(36) color: boat ? #red : #green;
	} }

grid cell file: DEM_grid_file neighbors: 4 {
	float altitude <- #max_float;
	float dyke_altitude;
	list<dyke> dykes;
	bool is_river;
	float flooding_level;
	geometry shape_union <- shape + 0.1;
}

experiment "Base" type: gui virtual: true{
	
	output {
		display map type: 3d axes: false virtual: true {

			species building refresh: false;
			species road;
			species people;
			species evacuation_point;
			species dyke;
			species river transparency: 0.5;
		}
	}
	
	
}





