const fs = require('fs');

// 8.3 Mb for uncompressed RGBA data
// 286 Kb for jpg data
var data = fs.readFileSync('image.jpg');
data = data.buffer.slice(0,data.byteLength * 1)
console.log(data); 

////////////// UDP Client ///////////////

const dgram = require('dgram');

// Constants
const SERVER_PORT = 3200;
const SERVER_ADDRESS = 'localhost';

// Create a UDP socket
const socket = dgram.createSocket('udp4');

// all packets before ackNumber are received 
// packet at ackNumber is not received 
// packets after ackNumber can be in either state
let ackNumber = 0 
let buffer = [];


// Bind the socket to a port and address
socket.bind(SERVER_PORT, SERVER_ADDRESS);

// Handle incoming packets
socket.on('message', (message, remote) => {
  const packet = JSON.parse(message.toString());
  buffer[packet.seqNumber] = packet

  if (ackNumber <= packet.seqNumber) {
    while (buffer[ackNumber]) {
      ackNumber++
    }
  }

  const ackPacket = {
    ackNumber: ackNumber,
    timeReceived: new Date().getTime()
  };
  const ackString = JSON.stringify(ackPacket);
  
  socket.send(ackString, remote.port, remote.address, (err) => {
    if (err) {
      console.error(err);
    } else {
      console.log(`Ack packet ${packet.seqNumber} back to client with ack number ${ackPacket.ackNumber}`) 
    }
  });

});