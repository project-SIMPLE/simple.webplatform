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
	
	list<string> players_to_kill <- [];
	bool restart <- false;
	
	
	init {
		ask gama {
			pref_experiment_ask_closing <- false;
		}
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
				do update_nb_agents;
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
				do update_nb_agents;
			}
			player_name <+ id_name_input;
		}
		do send_info;
		ask experiment {
			do update_outputs;
		}
		
	}
	
	reflex kill_player when:  length(players_to_kill) != 0 {
		loop player_to_kill over: players_to_kill {
			remove player_to_kill all:true from: player_name;
			ask first(Player where (each.id_player=player_to_kill)) {
				ask first(Player where (each.id_player=self.predator)) {
					self.prey <- myself.prey;
				}
				ask first(Player where (each.id_player=self.prey)) {
					self.predator <- myself.predator;
				}
				colors_allowed <+ self.color;
				do die;
			}
			list<Agent> agents_to_kill <- Agent where (each.type=player_to_kill);
			if length(agents_to_kill) != 0 {
				ask agents_to_kill {
					do die;
				}
			}
		}
		players_to_kill <- [];
		do send_info;
		
	}
	
	action remove_player(string id_name_input) {
		players_to_kill <+ id_name_input;
	}
	
	action change_strategy(string id_player_input, string new_strategy) {
		ask first(Player where (each.id_player=id_player_input)) {
			do change_strategy(new_strategy);
		}
		do send_info;
		ask experiment {
			do update_outputs;
		}
	}
	
	action change_attack_rate(string id_player_input, string new_attack_rate) {
		ask first(Player where (each.id_player=id_player_input)) {
			do change_attack_rate(new_attack_rate);
		}
		do send_info;
		ask experiment {
			do update_outputs;
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
		ask experiment {
			do update_outputs;
		}
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
	
	action restart {
		restart <- true;
	}
	
	reflex restart when: restart {
		list<string> copy_player_name <- player_name;
		player_name <- [];
		colors_allowed <- [#yellow, #blue, #green,#red, #purple];
		loop player_to_restart over: copy_player_name {
			Player player <- first(Player where (each.id_player= player_to_restart));
			string strategy <- player.strategy;
			string name_player <- player.name_player;
			float attack_rate <- player.attack_rate;
			ask first(Player where (each.id_player=player_to_restart)) {
				do die;
			}
			list<Agent> agents_to_kill <- Agent where (each.type=player_to_restart);
			if length(agents_to_kill) != 0 {
				ask agents_to_kill {
					do die;
				}
			}
			do create_player(player_to_restart);
			do set_name(player_to_restart, name_player);
			do change_strategy(player_to_restart, strategy);
			do change_attack_rate(player_to_restart, string(attack_rate));
		}
		restart <- false;
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
	action update_nb_agents {
		self.nb_agents <- length(Agent where (each.type=self.id_player));
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
	float speed <- 0.01*rnd(0.5,1.5);
	float radius_action <- size*200/100^2;
	float attack_rate;
	geometry action_area <- circle(radius_action);
	rgb color;
		
	reflex move {
		point direction <- {0,0};
		point new_loc;
		
		if strategy = "nearest" {
			Agent closest_predator <- closest_to(Agent where (each.type = self.predator), self);
			if  closest_predator != nil and norm(closest_predator.location - self.location) != 0 {
				direction <- direction - (closest_predator.location - self.location)/norm(closest_predator.location - self.location)*(1-attack_rate);
			}
			Agent closest_prey <- closest_to(Agent where (each.type = self.prey), self);
			if closest_prey != nil and norm(closest_prey.location - self.location) != 0{
				direction <- direction + (closest_prey.location - self.location)/norm(closest_prey.location - self.location)*attack_rate;
			}
		}
		else if strategy = "nearest_improved" {
			Agent closest_predator <- closest_to(Agent where (each.type = self.predator), self);
			if  closest_predator != nil {
				direction <- direction - (closest_predator.location - self.location)*(1-attack_rate);
			}
			Agent closest_prey <- closest_to(Agent where (each.type = self.prey), self);
			if closest_prey != nil {
				direction <- direction + (closest_prey.location - self.location)*attack_rate;
			}
		}
		else if strategy = "global_average" {
			 Player player_predator <- first(Player where (each.id_player=self.predator));
			 if  player_predator != nil and player_predator.is_alive = true and norm(player_predator.avg_location - self.location) != 0{
				direction <- direction - (player_predator.avg_location - self.location)/norm(player_predator.avg_location - self.location)*(1-attack_rate);
			}
			Player player_prey <- first(Player where (each.id_player=self.prey));
			if  player_prey != nil and player_prey.is_alive = true and norm(player_prey.avg_location - self.location)!=0 {
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

species user control:user_only {
   user_panel "Default" initial: true {
      transition to: "Basic Control" when: true;
   }
   
   user_panel "Basic Control" {
      user_command "Restart game" {
         ask world{
            do restart;
         }
      }
      transition to: "Default" when: true;                    
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
	
	action remove_player(string id_player_input) {
		ask world {
			do remove_player(id_player_input);
		}
	}
	
	action restart {
		ask world {
			do restart;
		}
	}
	
	user_command "Restart game" action: restart;
	
    output {
    	
    	display map fullscreen: true{
			species Agent aspect: base transparency: 0.5;
			
			//define a new overlay layer positioned at the coordinate 5,5, with a constant size of 180 pixels per 100 pixels.
			
            overlay position: { 0, 0 } size: { 250 #px, (25 + 70*6) #px } background: # black transparency: 0.5 border: #black rounded: true
            {
            	//for each possible type, we draw a square with the corresponding color and we write the name of the type
                float y <- 30#px;
                loop player over: Player
                {
                    draw square(15#px) at: { 20#px, y } color: player.color border: #white;
                    if player.is_alive {
                    	draw player.name_player +" - "+player.nb_agents at: { 40#px, y + 8#px } color: # white font: font("Helvetica", 20, #bold);
                    	draw player.strategy+" - "+ int(player.attack_rate*100) + "%" at: { 40#px, y + 28#px } color: # white font: font("Helvetica", 15);
                    }
                    else {
                    	draw player.name_player +" - "+player.nb_agents at: { 40#px, y + 8#px } color: # darkred font: font("Helvetica", 20, #bold);
                    	draw player.strategy+" - "+ int(player.attack_rate*100) + "%" at: { 40#px, y + 28#px } color: # darkred font: font("Helvetica", 15, #bold);
                    }
                    y <- y + 70#px;
                }
                if length(Player) != 0 and Player count (each.is_alive) = int(length(Player)/2) {
                	draw "End of game !" at: { 20#px, y + 40#px } color: # white font: font("Helvetica", 25, #bold);
                }
                
            }
		}
    }
}