/**
* Name: SendAndReceiveMessage
* Show how to send and receive a message from Unity. It works with the Scene "Assets/Scenes/Code Example/Send Receive Message" from the Unity Template
* Author: Patrick Taillandier
* Tags: Unity, messages
*/

model SendAndReceiveMessage


//Species that will make the link between GAMA and Unity. It has to inherit from the built-in species asbtract_unity_linker
species unity_linker parent: abstract_unity_linker {
	//name of the species used to represent a Unity player
	string player_species <- string(unity_player);

	//in this model, no information will be automatically sent to the Player at every step, so we set do_info_world to false
	bool do_send_world <- false;
	
	
	//reflex activated only when there is at least one player and every 100 cycles
	reflex send_message when: every(100 #cycle) and not empty(unity_player){
		
		//send a message to all players; the message should be a map (key: name of the attribute; value: value of this attribute)
		//the name of the attribute should be the same as the variable in the serialized class in Unity (c# script) 
		write "Send message: "  + cycle;
		do send_message players: unity_player as list mes: ["cycle":: cycle];
	}
	
	//action that will be called by the Unity player to send a message to the GAMA simulation
	action receive_message (string id, string mes) {
		write "Player " + id + " send the message: " + mes;
	}
}


//species used to represent an unity player, with the default attributes. It has to inherit from the built-in species asbtract_unity_player
species unity_player parent: abstract_unity_player;


//default experiment
experiment SimpleMessage type: gui ;


//default Unity (VR) experiment that inherit from the SimpleMessage experiment
//The unity type allows to create at the initialization one unity_linker agent
experiment vr_xp parent:SimpleMessage autorun: false type: unity {
	//minimal time between two simulation step
	float minimum_cycle_duration <- 0.05;

	//name of the species used for the unity_linker
	string unity_linker_species <- string(unity_linker);


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
}