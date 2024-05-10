extends Node

const WS_URL = "ws://localhost:9080"
var client

func _enter_tree():
	get_tree().set_multiplayer(
		MultiplayerAPI.create_default_interface()
	)

func _ready():
	client = $Client

func create_lobby(_player_name):
	client.start(WS_URL, _player_name, "")

func join_lobby(_player_name, lobbyCode):
	client.start(WS_URL, _player_name, lobbyCode)
