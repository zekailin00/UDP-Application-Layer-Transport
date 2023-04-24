const fs = require('fs');

// 8.3 Mb for uncompressed RGBA data
// 286 Kb for jpg data
let data = fs.readFileSync('image.jpg');
data = data.buffer.slice(0,data.byteLength * 1)
console.log(data);

let data_list = new Uint8Array(data)
console.log(data_list)

const PARTITION = 210
let subdata = new Uint8Array(data_list.subarray(0, data_list.length/PARTITION))
let transmissionData = ""

while(transmissionData.length < subdata.length)
transmissionData += "a"
console.log(JSON.stringify(transmissionData).length)


////////////// UDP Server ///////////////

const dgram = require('dgram');
const AsyncLock = require('async-lock');
const lock = new AsyncLock();

// Constants
const PORT = 3000;
const SERVER_PORT = 3200
const ADDRESS = '192.168.1.179';
const SERVER_ADDRESS = '192.168.1.122'

const WINDOW_SIZE = 64;
const TIMEOUT = 25
const SEND_INTERVAL = 1 // cannot be less than 1, needs to increase burst size for higher data rate
const BURST_SIZE = 6

const DEBUG_ON = false

// Create a UDP socket
const socket = dgram.createSocket('udp4');

// Create an empty window to hold sent packets
let windowStart = 0;
let windowEnd = 0;
let window = [];

let timeoutID = 0;

/////////////// Statistics ////////////////

let retransmissionCount = 0
let totalWindowSize = 0
let totalLatency = 0
let latencyCount = 0
let testInterval = 5000


// Create a function to retransmit packets if the timer expires
function retransmitPackets() {

  lock.acquire('window', (done) => {
    // Resend all packets in the window

    if(DEBUG_ON) console.log("!! Window length: " + window.length)
    for (let i = 0; i < window.length && (new Date().getTime() - window[i].time) > TIMEOUT; i++) {
      if(DEBUG_ON) console.log('!!     Retransmitting packets ' + window[i].seqNumber + " at " + (new Date().getTime()));
      
      retransmissionCount++
      const packetString = JSON.stringify(window[i]);
      socket.send(packetString, SERVER_PORT, SERVER_ADDRESS);

      if ((window[i].seqNumber + 1) % BURST_SIZE == 0)
        break;
    }
    
    // Restart the timer
    timeoutID = setTimeout(retransmitPackets, TIMEOUT);
    done();
  });

}

// Bind the socket to a port and address
socket.bind(PORT, ADDRESS);

// Handle incoming packets
socket.on('message', (message, remote) => {
  const packet = JSON.parse(message.toString());

  lock.acquire('window', (done) =>
  {
    let time = new Date().getTime()

    latencyCount++
    totalLatency += (time - packet.timeSent)
    if (latencyCount == testInterval)
    {
      console.log("Average latency: " + (totalLatency / latencyCount).toPrecision(3) + ' ms')
      latencyCount = 0
      totalLatency = 0
    }

    // if (DEBUG_ON) console.log(".. Packet delivered at " + packet.timeReceived)
    if (DEBUG_ON) console.log("<- Get ack " + packet.ackNumber + " at " + time)
    if (DEBUG_ON) console.log("$$ Current window size is " + window.length)
  
    // Remove all packets from the window that have been successfully received
    while (window.length > 0 && window[0].seqNumber < packet.ackNumber)
    {
      windowStart++
      window.shift();
    }
  
    done();
  });

});



//////////////////////////////////////////


const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});


let prog = (name) => {
  console.log(`Hey there ${name}!`);

  let frameNum = 0;
  let count = 0
  let i = 0

  setInterval(()=>{
    lock.acquire('window', (done) => {

      let burst = 0
      while (burst++ < BURST_SIZE)
      if (windowEnd - windowStart < WINDOW_SIZE) {

        let packet = {
          seqNumber: i,
          message: `Packet ${i}`,
          subdata: transmissionData,
          frameNum: frameNum,
          time: new Date().getTime()
        };

        if(DEBUG_ON) console.log("-> Send seq " + packet.seqNumber + " at " + packet.time)

        windowEnd++;
        window.push(packet);
        const packetString = JSON.stringify(packet);
        socket.send(packetString, SERVER_PORT, SERVER_ADDRESS);

        i++
        count++;
        frameNum = Math.floor(count / PARTITION)

        if (packet.seqNumber % testInterval == 0 && packet.seqNumber != 0)
        {
          console.log("Retransmission Rate: "
            + (retransmissionCount / testInterval).toPrecision(3)
            + " %")
            retransmissionCount = 0
        }

        totalWindowSize += window.length
        if (packet.seqNumber % testInterval == 0 && packet.seqNumber != 0)
        {
          console.log("Average window size: "
            + (totalWindowSize / testInterval).toPrecision(3))
            totalWindowSize = 0
        }


      }

      done();
    });
  }, SEND_INTERVAL);

  timeoutID = setTimeout(retransmitPackets, TIMEOUT);
}

readline.question('Enter to begin:\n', prog);
