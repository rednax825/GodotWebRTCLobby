extends Node2D

var multiplayerScene

var players : Dictionary


# Called when the node enters the scene tree for the first time.
func _ready():
	if not multiplayer.is_server():
		return

	randomize()
	multiplayerScene = get_node("/root/MultiplayerScene")
	
	add_player(1) # add self
	for id in multiplayer.get_peers():
		add_player(id) # add each peer
		
func add_player(id):
	var playerSceneInstance = preload("res://Player.tscn").instantiate()
	playerSceneInstance.position = Vector2(50, 50)
	playerSceneInstance.set_text(id)
	playerSceneInstance.name = str(id)
	playerSceneInstance.player = id
	$Players.add_child(playerSceneInstance, true)

