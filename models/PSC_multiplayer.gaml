/**
* Name: PaperStoneScissors
* This is a game that can be played in multiplayer mode using Gama Sever Mdiddleware
* Author: Leon Sillano
* Tags: 
*/


model PSCmultiplayer


global {
	float size <- 20.0;
	int number_agents_per_player <- 10;
	list<rgb> colors_allowed <- [#yellow, #blue, #green,#red, #purple];
	geometry shape <- rectangle(size,size);
	list<string> player_name;
	init {
		/*
		do add_player("0");
		do add_player("1");
		do add_player("2");
		do change_strategy("0","global_average");
		do change_strategy("1","global_average");
		do change_strategy("2","global_average");
		*/
	}
	
	action create_player(string id_name_input) {
		if length(player_name) != 0 {
			ask first(Player where (each.id_player=player_name[length(player_name)-1])) {
				do change_prey(id_name_input);
			}
			ask first(Player where (each.id_player=player_name[0])) {
				do change_predator(id_name_input);
			}
			
			create Player {
				self.is_alive <- true;
				self.color <- one_of(colors_allowed);
				remove item: self.color from:colors_allowed;
				self.id_player <- id_name_input;
				create Agent number: number_agents_per_player {
					self.type <- id_name_input;
					self.prey <- player_name[0];
					self.predator <- player_name[length(player_name)-1];
					self.color <- myself.color;
				}
				do change_prey(player_name[0]);
				do change_predator(player_name[length(player_name)-1]);
				do change_attack_rate("0.5");
			}
			player_name <+ id_name_input;
		}
		else {
			create Player {
				self.is_alive <- true;
				self.color <- one_of(colors_allowed);
				remove item: self.color from:colors_allowed;
				self.id_player <- id_name_input;
				create Agent number: number_agents_per_player {
					self.type <- id_name_input;
					self.color <- myself.color;
				}
				do change_attack_rate("0.5");
			}
			player_name <+ id_name_input;
		}
		do send_info;
	}
	action change_strategy(string id_player_input, string new_strategy) {
		ask first(Player where (each.id_player=id_player_input)) {
			do change_strategy(new_strategy);
		}
	}
	
	action change_attack_rate(string id_player_input, string new_attack_rate) {
		ask first(Player where (each.id_player=id_player_input)) {
			do change_attack_rate(new_attack_rate);
		}
	}
	
	action set_name(string id_player_input, string new_name) {
		list<Player> player_chosen <- Player where (each.id_player=id_player_input);
		if length(player_chosen) != 0 {
			ask first(player_chosen) {
				self.name_player <- new_name;
			}
		}
		do send_info;
	}
	
	reflex send_info {
		do send_info;
	}
	
	action send_info {
		list<map> contents;
		map<string,string> player_name_map <- create_map(Player collect (each.id_player), Player collect (each.name_player));
		map<string,rgb> player_color_map <- create_map(Player collect (each.id_player), Player collect (each.color));
		ask Player {
			map<string,unknown> info_json;
			map<string,unknown> contents_json;
			map<string, unknown> location_json;
			contents_json["color"] <- self.color;
			contents_json["nb_agents"] <- self.nb_agents;
			contents_json["name"] <- self.name_player;
			contents_json["strategy"] <- self.strategy;
			contents_json["attack_rate"] <- string(self.attack_rate);
			map<string, unknown> predator_json <- ["name"::player_name_map[self.predator], "color"::player_color_map[self.predator]];
			contents_json["predator"] <- predator_json;
			map<string, unknown> prey_json <- ["name"::player_name_map[self.prey], "color"::player_color_map[self.prey]];
			contents_json["prey"] <- prey_json;
			info_json["id"] <- [self.id_player];
			info_json["contents"] <- contents_json;		
			contents <+ info_json;			
		}
		map<string, unknown> json;
		json["contents"] <- contents;
		ask gama {
			do send message: to_json(json);
		}
	}
}

species Player {
	string name_player;
	string id_player;
	string prey;
	string predator;
	string strategy;
	rgb color;
	float attack_rate;
	
	bool is_alive;
	int nb_agents;	
	point avg_location;
	
	
	action change_strategy(string new_strategy){
		self.strategy <- new_strategy;
		ask Agent where (each.type = self.id_player) {
			self.strategy <- new_strategy;
		}
	}
	
	action change_prey(string new_prey) {
		self.prey <- new_prey;
		ask Agent where (each.type = self.id_player) {
			self.prey <- new_prey;
		}
	}
	
	action change_predator(string new_predator) {
		
		self.predator <- new_predator;
		ask Agent where (each.type = self.id_player) {
			self.predator <- new_predator;
		}
	}
	
	action change_attack_rate(string new_attack_rate_s) {
		self.attack_rate <- float(new_attack_rate_s);
		ask Agent where (each.type = self.id_player) {
			self.attack_rate <- myself.attack_rate;
		}
	}
	
	reflex calculate_barycenters {
		list<Agent> my_agents <- Agent where (each.type=self.id_player);
		self.nb_agents <- length(my_agents);
		if length(my_agents) = 0 {
			self.is_alive <- false;
		}
		else {
			self.avg_location <- my_agents mean_of (each.location);
		}
	}
	
}

species Agent skills: [moving] {
	string type;
	string predator;
	string prey;
	string strategy;
	float speed <- 0.1*rnd(0.5,1.5);
	float radius_action <- size*200/100^2;
	float attack_rate;
	geometry action_area <- circle(radius_action);
	rgb color;
		
	reflex move {
		point direction <- {0,0};
		point new_loc;
		
		if strategy = "nearest" {
			Agent closest_predator <- closest_to(Agent where (each.type = self.predator), self);
			if  closest_predator != nil {
				direction <- direction - (closest_predator.location - self.location)/norm(closest_predator.location - self.location)*(1-attack_rate);
			}
			Agent closest_prey <- closest_to(Agent where (each.type = self.prey), self);
			if closest_prey != nil {
				direction <- direction + (closest_prey.location - self.location)/norm(closest_prey.location - self.location)*attack_rate;
			}
		}
		if strategy = "global_average" {
			 Player player_predator <- first(Player where (each.id_player=self.predator));
			 if  player_predator != nil and player_predator.is_alive = true {
				direction <- direction - (player_predator.avg_location - self.location)/norm(player_predator.avg_location - self.location)*(1-attack_rate);
			}
			Player player_prey <- first(Player where (each.id_player=self.prey));
			if  player_prey != nil and player_prey.is_alive = true  {
				direction <- direction + (player_prey.avg_location - self.location)/norm(player_prey.avg_location - self.location)*attack_rate;
			}
		}
		if norm(direction) != 0.0 {
			self.location <- self.location + direction/norm(direction)*speed;
		}
		self.location <- {max(min(self.location.x,size),0),max(min(self.location.y,size),0)};
		action_area <- circle(radius_action);
	}
	
	reflex attack {
		ask  at_distance(Agent where (each.type = self.prey), 2*radius_action) {
			self.type <- myself.type;
			self.predator <- myself.predator;
			self.prey <- myself.prey;
			self.color <- myself.color;
			self.strategy <- myself.strategy;
		}
	}
	
	aspect base {
		draw circle(size/4/100) at: location color: #black ;
		draw action_area color: color;
	}
}

experiment Battle type:gui {
	
	action create_player(string id_player_input) {
		ask world {
			do create_player(id_player_input);
		}
	}
	
	action change_strategy(string id_player_input, string strategy) {
		ask world {
			do change_strategy(id_player_input, strategy);
		}
	}
	
	action change_attack_rate(string is_player_input, string new_attack_rate) {
		ask world {
			do change_attack_rate(is_player_input, new_attack_rate);
		}
	}
	
	action set_name(string is_player_input, string new_name) {
		ask world {
			do set_name(is_player_input, new_name);
		}
	}
	
	
    output {
    	display map fullscreen: false{
			species Agent aspect: base transparency: 0.5;
			
			//define a new overlay layer positioned at the coordinate 5,5, with a constant size of 180 pixels per 100 pixels.
			
            overlay position: { 5, 5 } size: { 150 #px, (25 + 25*5) #px } background: # black transparency: 0.5 border: #black rounded: true
            {
            	//for each possible type, we draw a square with the corresponding color and we write the name of the type
                float y <- 30#px;
                loop player over: Player
                {
                    draw square(15#px) at: { 20#px, y } color: player.color border: #white;
                    draw player.name_player at: { 40#px, y + 4#px } color: # white font: font("Helvetica", 20, #bold);
                    y <- y + 25#px;
                }

            }
		}
    }
}