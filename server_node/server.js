// packages
const WebSocket = require('ws');
const crypto = require('crypto');

// server configuration constants
const PORT = 9080;
const LOBBY_CODE_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; 
const NO_LOBBY_TIMEOUT = 1000; // timeout clients automatically if they have not joined a lobby in this amount of time
const SEAL_CLOSE_TIMEOUT = 10000; // timeout between when a lobby is sealed, and when it is deleted
const MAX_PEERS = 4096;
const MAX_LOBBIES = 1024;
const PING_INTERVAL = 10000;

// error and info constants
const STR_NO_LOBBY = 'Client did not join a lobby before timeout';
const STR_HOST_DISCONNECTED = 'The lobby host disconnected, the lobby has been closed';
const STR_ONLY_HOST_CAN_SEAL = 'Only the lobby host can seal the lobby';
const STR_SEAL_COMPLETE = 'The lobby has been sealed';
const STR_TOO_MANY_LOBBIES = 'The maximum number of lobbies are already open, disconnecting';
const STR_ALREADY_IN_LOBBY = 'Already in a lobby';
const STR_LOBBY_NOT_FOUND = 'The requested lobby does not exist';
const STR_LOBBY_IS_SEALED = 'The requested lobby is sealed';
const STR_INVALID_FORMAT = 'Attempted to parse message with invalid format';
const STR_NEED_LOBBY = 'Client must be in a lobby to perform that action';
const STR_SERVER_ERROR = 'Server error, lobby not found';
const STR_INVALID_DESTINATION = 'Invalid destination';
const STR_INVALID_MESSAGE_TYPE = 'Invalid Message Type';
const STR_TOO_MANY_PEERS = 'Too many peers connected';
const STR_INVALID_TRANSFER_MODE = 'Invalid Transfer Mode';
const STR_INVALID_JOIN_DATA = 'Data portion of join message could not be parsed';

// message type enum
const MSG_TYPE = {
	JOIN: 0,
	ID: 1,
	PEER_CONNECT: 2,
	PEER_DISCONNECT: 3,
	OFFER: 4,
	ANSWER: 5,
	CANDIDATE: 6,
	SEAL: 7
};


// main objects
const wss = new WebSocket.Server({port: PORT});
const lobbies = new Map();
let peersCount = 0;



// helper functions
function randomInt(low, high) {
	return Math.floor(Math.random() * (high - low + 1) + low);
}

function randomId() {
	return Math.abs(new Int32Array(crypto.randomBytes(4).buffer)[0]);
}

function genLobbyCode() {
	let out = '';
	for(let i = 0; i < 6; i++) {
		out += LOBBY_CODE_CHARACTERS[randomInt(0, LOBBY_CODE_CHARACTERS.length - 1)];
	}
	return out;
}

function ProtoMessage(type, id, data) {
	return JSON.stringify({
		'type':type,
		'id':id,
		'data':data || '',
	});
}

// classes
class ProtoError extends Error {
	constructor(code, message) {
		super(message);
		this.code = code;
	}
}

class Peer {
	constructor(id, ws) {
		this.id = id;
		this.player_name = '';
		this.ws = ws;
		this.lobby = '';
		
		// Automatically close client connection if no lobby has been joined
		this.timeout = setTimeout(() => {
			if(!this.lobby) {
				ws.close(4000, STR_NO_LOBBY);
			}
		}, NO_LOBBY_TIMEOUT);
	}
}

class Lobby {
	constructor(name, host) {
		this.name = name;
		this.host = host;
		this.peers = [];
		this.sealed = false;
		this.closeTimer = -1;
	}
	
	getPeerId(peer) {
		if(this.host === peer.id) {
			return 1; // host always gets id = 1
		}
		return peer.id;
	}
	
	join(peer) {
		// get ID of the new peer in the lobby
		const joiningPeerId = this.getPeerId(peer);
		// send ID to the new Peer
		peer.ws.send(ProtoMessage(MSG_TYPE.ID, joiningPeerId));
		this.peers.forEach((p) => {
			// send ID of new peer to all other peers in the Lobby
			p.ws.send(ProtoMessage(MSG_TYPE.PEER_CONNECT, joiningPeerId, peer.player_name));
			// send the ID of each other peer to the newly connected peer
			peer.ws.send(ProtoMessage(MSG_TYPE.PEER_CONNECT, this.getPeerId(p), p.player_name));
		});
		// add new peer to peer Array
		this.peers.push(peer);
	}
	
	leave(peer) {
		// find index of leaving peer in peer array
		const idx = this.peers.findIndex((p) => peer === p);
		if (idx === -1) {
			return false; // leaving peer not found. This shouldn't happen, but just in case here is a safeguard
		}
		const leavingPeerId = this.getPeerId(peer);
		const roomHostLeft = leavingPeerId === 1;
		this.peers.forEach((p) => {
			if(roomHostLeft) {
				// if the lobby host left, close connection with all peers
				p.ws.close(4000, STR_HOST_DISCONNECTED);
			} else {
				// if a non-host member left, just let each remaining member know they are gone
				p.ws.send(ProtoMessage(MSG_TYPE.PEER_DISCONNECT, leavingPeerId));
			}
		});
		// update the lobby record
		this.peers.splice(idx, 1);
		if(roomHostLeft && this.closeTimer >= 0) {
			// already closing the room
			clearTimeout(this.closeTimer);
			this.closeTimer = -1;
		}
		return roomHostLeft;
	}
	
	seal(peer) {
		// only host can SEAL
		if(this.getPeerId(peer) !== 1) {
			throw new ProtoError(4000, STR_ONLY_HOST_CAN_SEAL)
		}
		// notify each peer that the lobby is sealed
		this.peers.forEach((p) => {
			p.ws.send(ProtoMessage(MSG_TYPE.SEAL, 0));
		});
		// prep lobby for deletion
		this.sealed = true;
		this.closeTimer = setTimeout(() => {
			// after a small delay, close connection with all peers
			this.peers.forEach((p) => {
				p.ws.close(1000, STR_SEAL_COMPLETE);
			});
		}, SEAL_CLOSE_TIMEOUT);
	}
}


// main functions

function joinLobby(peer, pLobby, player_name) {
	let lobbyName = pLobby;
	peer.player_name = player_name;
	
	// if a new lobby needs to be created
	if(lobbyName === '') {
		// handle potential errors
		if(lobbies.size >= MAX_LOBBIES) {
			throw new ProtoError(4000, STR_TOO_MANY_LOBBIES);
		}
		if(peer.lobby !== '') {
			throw new ProtoError(4000, STR_ALREADY_IN_LOBBY);
		}
		
		// create new lobby
		lobbyName = genLobbyCode();
		lobbies.set(lobbyName, new Lobby(lobbyName, peer.id));
		console.log(`Created new lobby ${lobbyName}`)
	}
	
	const lobby = lobbies.get(lobbyName);
	if(!lobby) {
		throw new ProtoError(4000, STR_LOBBY_NOT_FOUND);
	}
	if(lobby.sealed) {
		throw new ProtoError(4000, STR_LOBBY_IS_SEALED)
	}
	peer.lobby = lobbyName;
	lobby.join(peer);
	peer.ws.send(ProtoMessage(MSG_TYPE.JOIN, 0, lobbyName));
	console.log(`Added peer ${peer.id} with name \"${peer.player_name}\" to lobby ${lobbyName}`)
}

function parseMsg(peer, msg) {
	let json = null;
	// attempt to parse json
	try {
		json = JSON.parse(msg)
	} catch (e) {
		throw new ProtoError(4000, STR_INVALID_FORMAT);
	}
	
	// unpack msg consts
	const type = typeof(json['type']) === 'number' ? Math.floor(json['type']) : -1;
	const id = typeof(json['id']) === 'number' ? Math.floor(json['id']) : -1;
	const data = typeof(json['data']) === 'string' ? json['data'] : '';

	// error checking on type and ID
	if(type < 0 || id < 0) {
		throw new ProtoError(4000, STR_INVALID_FORMAT);
	}
	
	// lobby joining
	if (type === MSG_TYPE.JOIN) {
		var lobby_to_join = "";
		var player_name = data;

		if(id) {
			var lobby_to_join = data.substring(0, 6);
			var player_name = data.substring(6);
		}
		
		joinLobby(peer, lobby_to_join, player_name);
		return;
	}
	
	// peers that are not in lobbies can only join lobbies, nothing else
	if(!peer.lobby) {
		throw new ProtoError(4000, STR_NEED_LOBBY);
	}
	
	// get lobby
	const lobby = lobbies.get(peer.lobby);
	if(!lobby) {
		throw new ProtoError(4000, STR_SERVER_ERROR);
	}
	
	// lobby sealing
	if(type === MSG_TYPE.SEAL) {
		lobby.seal(peer);
		return;
	}
	
	// relay other message types
	if(type === MSG_TYPE.OFFER || type === MSG_TYPE.ANSWER || type === MSG_TYPE.CANDIDATE) {
		let destId = id;
		if(id === 1) {
			destId = lobby.host;
		}
		const dest = lobby.peers.find((e) => e.id === destId);
		// dest is not in the lobby
		if(!dest) {
			throw new ProtoError(4000, STR_INVALID_DESTINATION);
		}
		dest.ws.send(ProtoMessage(type, lobby.getPeerId(peer), data));
		return;
	}
	throw new ProtoError(4000, STR_INVALID_MESSAGE_TYPE);
}

wss.on('connection', (ws) => {
	if(peersCount >= MAX_PEERS) {
		ws.close(4000, STR_TOO_MANY_PEERS);
		return;
	}
	
	peersCount++;
	const id = randomId();
	const peer = new Peer(id, ws);
	ws.on('message', (message) => {
		if(typeof message !== 'string') {
			ws.close(4000, STR_INVALID_TRANSFER_MODE);
			return;
		}
		try {
			parseMsg(peer, message);
		} catch(e) {
			const code = e.code || 4000;
			console.log(`Error ${code} parsing message from ${id}:\n${
				message}`);
			ws.close(code, e.message);
		}
	});
	ws.on('close', (code, reason) => {
		peersCount--;
		console.log(`Connection with peer ${peer.id} closed `
			+ `with reason ${code}: ${reason}`);
		if(peer.lobby && lobbies.has(peer.lobby)
			&& lobbies.get(peer.lobby).leave(peer)) {
			lobbies.delete(peer.lobby);
			console.log(`Deleted lobby ${peer.lobby}`);
			console.log(`Open lobbies: ${lobbies.size}`);
			peer.lobby = '';
		}
		if(peer.timeout >= 0) {
			clearTimeout(peer.timeout);
			peer.timeout = -1;
		}
	});
	ws.on('error', (error) => {
		console.error(error);
	});
});

const interval = setInterval(() => {
	wss.clients.forEach((ws) => {
		ws.ping();
	});
}, PING_INTERVAL);