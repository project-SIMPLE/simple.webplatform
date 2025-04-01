/**
* Name: Race
* Based on the internal skeleton template. 
* Author: patricktaillandier
* Tags: 
*/

model Race_to_token

global {
	int size_maze <- 10;
	int number_tokens <- 20;
	
	init {
		do generate_maze;
		do generate_tokens;
	}
	action generate_maze {
		list<geometry> geoms <- split_lines(union(cell collect each.shape.contour));
		create wall from: geoms;
		list<cell> visited_cells;
		list<cell> stack ;
		cell c <- one_of(cell);
		visited_cells << c;
		stack << c;
		cell current_cell;
		loop while: not empty(stack) {
			current_cell <- one_of(stack);
			stack >> current_cell;
			list<cell> neighs <- (current_cell.neighbors - visited_cells);
			if (not empty(neighs)) {
				stack << current_cell;
				cell chosen_cell <- one_of(neighs);
				ask wall overlapping line([current_cell.location, chosen_cell.location]) {
					do die;
				}
				visited_cells << chosen_cell;
				stack << chosen_cell;
			}
		}
		ask wall {
			shape <- shape + 0.05;
		} 
	}
	
	action generate_tokens {
		list<cell> free_cells <- list(cell);
		create token number: min(number_tokens, length(free_cells) - 4) {
			cell c <- one_of(free_cells);
			location <- c.location;
			free_cells >> c;
		}
	}
}

grid cell width: size_maze height: size_maze neighbors: 4{
	bool is_wall <- true;
}

species wall {
	aspect default {
		draw shape color: #black;	
	}	
	
}

species token {
	aspect default {
		draw circle(1) color: #yellow border: #black;
	}	
}

experiment begin_race type: gui {
	output {
		display map {
			species wall;
			species token;
		}
	}
}
