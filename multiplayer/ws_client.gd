extends Node

enum MSG_TYPE {JOIN, ID, PEER_CONNECT, PEER_DISCONNECT, OFFER, ANSWER, CANDIDATE, SEAL}

var lobby := ""
var player_name := ""
var ws_peers : Dictionary

var ws: WebSocketPeer = WebSocketPeer.new()
var code = 1000
var reason = "Unknown"
var old_state = WebSocketPeer.STATE_CLOSED

signal disconnected()
signal connected(id)
signal lobby_joined(lobby)
signal lobby_sealed()
signal peer_connected(id)
signal peer_disconnected(id)
signal offer_received(id, offer)
signal answer_received(id, answer)
signal candidate_received(id, mid, index, sdp)

func connect_to_url(url, _player_name):
	# clear settings that may have been changed from a previous connection
	close()
	code = 1000
	reason = "Unknown"
	player_name = _player_name
	# connect
	ws.connect_to_url(url)

func close():
	ws.close()

func _process(_delta):
	ws.poll()
	var state = ws.get_ready_state()
	# automatically join lobby if ready
	if state != old_state and state == WebSocketPeer.STATE_OPEN:
		join_lobby(lobby, player_name)
	# parse all available packets
	while state == WebSocketPeer.STATE_OPEN and ws.get_available_packet_count():
		if not _parse_msg():
			print("Error parsing message from server.")
	# handle disconnections
	if state != old_state and state == WebSocketPeer.STATE_CLOSED:
		code = ws.get_close_code()
		reason = ws.get_close_reason()
		disconnected.emit()
	# update state tracker
	old_state = state

func _parse_msg():
	# attempt to get dict from JSON blob, handle errors
	var parsed = JSON.parse_string(ws.get_packet().get_string_from_utf8())
	if typeof(parsed) != TYPE_DICTIONARY or not parsed.has("type") or not parsed.has("id") or \
		typeof(parsed.get("data")) != TYPE_STRING:
		return false
	var msg := parsed as Dictionary
	if not str(msg.type).is_valid_int() or not str(msg.id).is_valid_int():
		return false
	
	var type := str(msg.type).to_int()
	var src_id := str(msg.id).to_int()
	var msg_data := str(msg.data)
	
	if type == MSG_TYPE.ID:
		connected.emit(src_id)
	elif type == MSG_TYPE.JOIN:
		lobby_joined.emit(msg.data)
	elif type == MSG_TYPE.SEAL:
		lobby_sealed.emit()
	elif type == MSG_TYPE.PEER_CONNECT:
		ws_peers[src_id] = msg_data
		peer_connected.emit(src_id)
	elif type == MSG_TYPE.PEER_DISCONNECT:
		ws_peers.erase(src_id)
		peer_disconnected.emit(src_id)
	elif type == MSG_TYPE.OFFER:
		offer_received.emit(src_id, msg.data)
	elif type == MSG_TYPE.ANSWER:
		answer_received.emit(src_id, msg.data)
	elif type == MSG_TYPE.CANDIDATE:
		# process candidate reception
		var candidate: PackedStringArray = msg.data.split("\n", false)
		if candidate.size() != 3:
			return false
		if not candidate[1].is_valid_int():
			return false
		candidate_received.emit(src_id, candidate[0], candidate[1].to_int(), candidate[2])
	else:
		return false
	return true # parsed successfully

func join_lobby(lobbyToJoin: String, _player_name):
	var d = JSON.stringify({
		"lobby": lobbyToJoin,
		"name": _player_name
	})
	return _send_msg(MSG_TYPE.JOIN, 0, d)

func seal_lobby():
	return _send_msg(MSG_TYPE.SEAL, 0)

func send_candidate(id, mid, index, sdp) -> int:
	return _send_msg(MSG_TYPE.CANDIDATE, id, "\n%s\n%d\n%s" % [mid, index, sdp])

func send_offer(id, offer) -> int:
	return _send_msg(MSG_TYPE.OFFER, id, offer)

func send_answer(id, answer) -> int:
	return _send_msg(MSG_TYPE.ANSWER, id, answer)

func _send_msg(type: int, id: int, data:="") -> int:
	return ws.send_text(JSON.stringify({
		"type": type,
		"id": id,
		"data": data,
	}))
