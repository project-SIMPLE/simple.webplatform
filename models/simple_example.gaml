/**
* Name: GamaServerLinkerExample
* Based on the internal empty template. 
* Author: Léon
* Tags: 
*/


model GamaServerLinkerExample


global {

	init {
		ask gama {
			pref_experiment_ask_closing <- false;
		}
	}

	reflex  send_simulation_info when:every(1 #cycle){
		list<map> contents;
		loop player over:Player {
			if(player.isAlive){
				map<string,unknown> info_json;
				map<string,unknown> contents_json;
				map<string, unknown> location_json;
				location_json["x"] <- player.location.x;
				location_json["y"] <- player.location.y;
				contents_json["position"] <- location_json;
				contents_json["color"] <- player.color;
				info_json["id"] <- [player.id];
				info_json["contents"] <- contents_json;		
				contents <+ info_json;			
			}
		}
		map<string, unknown> json;
		json["contents"] <- contents;
		ask gama {
			do send message: to_json(json);
		}
	}
	
	action send_init_info(string id_player) {
		ask first(Player where (each.id=id_player)){
			list<map> contents;
			write id_player;
			map<string,unknown> info_json;
			map<string,unknown> contents_json;
			info_json["id"] <- [self.id];
			info_json["contents"] <- "Init message";
			contents <+ info_json;	
			map<string, unknown> json;
			json["contents"] <- contents;
			ask gama {
				do send message: to_json(json);
			}
		}
	}
}

species Player skills:[moving] {
	
	string id;
	rgb color <- rgb(rnd(0,255),rnd(0,255),rnd(0,255));
	bool isAlive;
	init {
		isAlive <- true;
	}

    reflex move {
        do wander;
    }
	
    aspect base {
    	if(isAlive) {
    		draw circle(1) color:color;
    	}
    }
}

// Créez un environnement avec une zone spécifique où RandomGuy se déplace
experiment random_walk_example type:gui {
	
	action create_player(string id_player) {
		create Player {
			id <- id_player;
		}
	}
	
	action remove_player(string id_player) {
		loop player over: Player {
			if (player.id = id_player){
				player.isAlive <- false;
			}
		}
	}

	action init_player(string id_player) {
		ask world {
			do send_init_info(id_player);
		}
	}
	
	
    float minimum_cycle_duration <- 0.03 #second;
    output {
    	display map {
			species Player aspect: base;
		}
    }
}