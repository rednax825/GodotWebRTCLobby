extends MultiplayerSynchronizer

@export var direction := Vector2()


func _ready():
	set_process(get_multiplayer_authority() == multiplayer.get_unique_id())

# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(_delta):
	direction = Input.get_vector("move_left", "move_right", "move_up", "move_down")