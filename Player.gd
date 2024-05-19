extends Area2D

const speed = 300

@export var player := 1 :
	set(id):
		player = id
		$PlayerInput.set_multiplayer_authority(id)

@onready var input = $PlayerInput

# Called when the node enters the scene tree for the first time.
func _ready():
	get_node("Polygon2D").color = Color.CRIMSON

func set_text(text):
	get_node("NameLabel").text = str(text)

# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta):
	var velocity = Vector2.ZERO
	if input.direction.length() > 0:
		velocity = input.direction.normalized() * speed
	position += velocity * delta
