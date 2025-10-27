const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();

const wss = new WebSocket.Server({ server });

const sessionState = {
  videoId: 'dQw4w9WgXcQ',
  isPlaying: false,
  currentTime: 0,
  lastUpdateTime: Date.now()
};

const clients = new Set();

const broadcast = (data, sender) => {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

const broadcastToAll = (data) => {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

const updateCurrentTime = () => {
  if (sessionState.isPlaying) {
    const now = Date.now();
    const elapsed = (now - sessionState.lastUpdateTime) / 1000;
    sessionState.currentTime += elapsed;
    sessionState.lastUpdateTime = now;
  }
};

wss.on('connection', (ws) => {
  console.log('New client connected');
  clients.add(ws);

  updateCurrentTime();

  ws.send(JSON.stringify({
    type: 'sync',
    videoId: sessionState.videoId,
    isPlaying: sessionState.isPlaying,
    currentTime: sessionState.currentTime,
    userCount: clients.size
  }));

  broadcastToAll({
    type: 'userCount',
    count: clients.size
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch(data.type) {
        case 'play':
          updateCurrentTime();
          sessionState.isPlaying = true;
          sessionState.lastUpdateTime = Date.now();
          
          broadcastToAll({
            type: 'play'
          });
          console.log('Play event broadcasted');
          break;

        case 'pause':
          updateCurrentTime();
          sessionState.isPlaying = false;
          
          broadcastToAll({
            type: 'pause'
          });
          console.log('Pause event broadcasted');
          break;

        case 'seek':
          sessionState.currentTime = data.time;
          sessionState.lastUpdateTime = Date.now();
          
          broadcastToAll({
            type: 'seek',
            time: data.time
          });
          console.log(`Seek event broadcasted: ${data.time}s`);
          break;

        case 'changeVideo':
          sessionState.videoId = data.videoId;
          sessionState.isPlaying = false;
          sessionState.currentTime = 0;
          sessionState.lastUpdateTime = Date.now();
          
          broadcastToAll({
            type: 'changeVideo',
            videoId: data.videoId
          });
          console.log(`Video changed: ${data.videoId}`);
          break;

        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
    
    broadcastToAll({
      type: 'userCount',
      count: clients.size
    });
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`WebSocket server is running on port ${PORT}`);
  console.log(`Initial video: ${sessionState.videoId}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  wss.close(() => {
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing server...');
  wss.close(() => {
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
});