extends Control

var multiplayerScene

func _ready():
	multiplayerScene = get_node("/root/MultiplayerScene")
	multiplayerScene.client.lobby_joined.connect(_lobby_joined)

func validate_name(inputName):
	inputName = inputName.strip_edges()
	var regex = RegEx.new()
	regex.compile("^(?=.{3,20}$)(?![_.])(?!.*[_.]{2})[a-zA-Z0-9._]+(?<![_.])$")
	return regex.search(inputName) != null

func validate_code(code):
	code = code.strip_edges()
	var regex = RegEx.new()
	# matches UUID
	regex.compile("^[A-Z]{6}$")
	return regex.search(code) != null

func _on_host_name_line_edit_text_changed(inputName):
	get_node("HostPanel/HostButton").disabled = !validate_name(inputName)

func _on_join_code_line_edit_text_changed(code):
	var code_valid = validate_code(code)
	var name_valid = validate_name(get_node("JoinPanel/ClientNameLineEdit").text)
	get_node("JoinPanel/JoinButton").disabled = !(code_valid && name_valid)

func _on_client_name_line_edit_text_changed(inputName):
	var code_valid = validate_code(get_node("JoinPanel/JoinCodeLineEdit").text)
	var name_valid = validate_name(inputName)
	get_node("JoinPanel/JoinButton").disabled = !(code_valid && name_valid)

func _on_host_button_pressed():
	multiplayerScene.create_lobby(get_node("HostPanel/HostNameLineEdit").text)

func _on_join_button_pressed():
	var name = get_node("JoinPanel/ClientNameLineEdit").text
	var code = get_node("JoinPanel/JoinCodeLineEdit").text
	multiplayerScene.join_lobby(name, code)
	
func _lobby_joined(lobby):
	get_tree().change_scene_to_file("res://LobbyScene.tscn")
