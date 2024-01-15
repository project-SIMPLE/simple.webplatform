/**
* Name: GamaServerLinkerExample
* Based on the internal empty template. 
* Author: Léon
* Tags: 
*/


model GamaServerLinkerExample


global {
	
	action reply(string id, string id_message, string content) {
		list<map> contents;
		map<string,unknown> info_json;
		map<string,unknown> contents_json;
		contents_json["random_content"] <- content;
		contents_json["id_message"] <- id_message;
		info_json["id"] <- [id];
		info_json["contents"] <- contents_json;		
		contents <+ info_json;			
		map<string, unknown> json;
		json["contents"] <- contents;
		ask gama {
			do send message: to_json(json);
		}
	}
}
// Créez un environnement avec une zone spécifique où RandomGuy se déplace
experiment tester type:gui {
	
	action reply(string id, string id_message, string content) {
		ask world {
			do reply(id, id_message, content);
		}
	}
	
}