extends Control

var multiplayerScene
var count = 0

# Called when the node enters the scene tree for the first time.
func _ready():
	multiplayerScene = get_node("/root/MultiplayerScene")
	multiplayerScene.client.lobby_sealed.connect(_lobby_sealed)
	get_node("LobbyPanel/JoinCodeCopyButton").text = multiplayerScene.client.lobby
	if multiplayerScene.client.ws_id == 1:
		get_node("LobbyPanel/WaitingForHostLabel").visible = false
	else:
		get_node("LobbyPanel/StartButton").visible = false
	
	update_player_list()

# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(_delta):
	count += 1
	if count % 30 == 0:
		count = 0
		update_player_list()

func _on_join_code_copy_button_pressed():
	DisplayServer.clipboard_set(multiplayerScene.client.lobby)

func update_player_list():
	var player_list = get_node("LobbyPanel/PlayersListItemList")
	player_list.clear()
	player_list.add_item(multiplayerScene.client.player_name, null, false)
	for p in multiplayerScene.client.ws_peers.values():
		player_list.add_item(p, null, false)

func _on_start_button_pressed():
	multiplayerScene.client.seal_lobby()
	
func _lobby_sealed():
	get_tree().change_scene_to_file("res://GameScene.tscn")
