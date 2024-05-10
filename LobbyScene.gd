extends Control

var multiplayerScene

# Called when the node enters the scene tree for the first time.
func _ready():
	multiplayerScene = get_node("/root/MultiplayerScene")
	multiplayerScene.client.peer_connected.connect(update_player_list)
	multiplayerScene.client.peer_disconnected.connect(update_player_list)
	get_node("LobbyPanel/JoinCodeCopyButton").text = multiplayerScene.client.lobby
	update_player_list()

# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta):
	pass

func _on_join_code_copy_button_pressed():
	DisplayServer.clipboard_set(multiplayerScene.client.lobby)

func update_player_list():
	var player_list = get_node("LobbyPanel/PlayersListItemList")
	player_list.clear()
	player_list.add_item(multiplayerScene.client.player_name, null, false)
	for p in multiplayerScene.client.ws_peers.values():
		player_list.add_item(p, null, false)
