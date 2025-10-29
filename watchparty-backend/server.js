import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Global session state
let sessionState = {
  videoUrl: '',
  videoId: '',
  isPlaying: false,
  currentTime: 0,
  lastUpdateTimestamp: Date.now(),
  connectedUsers: 0
};

// Extract YouTube video ID from URL
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Calculate current time based on last update
function getCurrentPlaybackTime() {
  if (!sessionState.isPlaying) {
    return sessionState.currentTime;
  }
  const elapsed = (Date.now() - sessionState.lastUpdateTimestamp) / 1000;
  return sessionState.currentTime + elapsed;
}

io.on('connection', (socket) => {
  sessionState.connectedUsers++;
  console.log(`User connected. Total users: ${sessionState.connectedUsers}`);

  // Send current state to new user
  socket.emit('initial-state', {
    ...sessionState,
    currentTime: getCurrentPlaybackTime()
  });

  // Broadcast user count to all clients
  io.emit('user-count', sessionState.connectedUsers);

  // Handle video URL change
  socket.on('change-video', (url) => {
    const videoId = extractVideoId(url);
    if (videoId) {
      sessionState.videoUrl = url;
      sessionState.videoId = videoId;
      sessionState.isPlaying = false;
      sessionState.currentTime = 0;
      sessionState.lastUpdateTimestamp = Date.now();
      
      // Broadcast to all clients including sender
      io.emit('video-changed', {
        videoUrl: url,
        videoId: videoId,
        isPlaying: false,
        currentTime: 0
      });
    }
  });

  // Handle play event
  socket.on('play', (currentTime) => {
    sessionState.isPlaying = true;
    sessionState.currentTime = currentTime;
    sessionState.lastUpdateTimestamp = Date.now();
    
    // Broadcast to all other clients
    socket.broadcast.emit('play', currentTime);
  });

  // Handle pause event
  socket.on('pause', (currentTime) => {
    sessionState.isPlaying = false;
    sessionState.currentTime = currentTime;
    sessionState.lastUpdateTimestamp = Date.now();
    
    // Broadcast to all other clients
    socket.broadcast.emit('pause', currentTime);
  });

  // Handle seek event
  socket.on('seek', (currentTime) => {
    sessionState.currentTime = currentTime;
    sessionState.lastUpdateTimestamp = Date.now();
    
    // Broadcast to all other clients
    socket.broadcast.emit('seek', currentTime);
  });

  // Handle sync request (for drift correction)
  socket.on('request-sync', () => {
    socket.emit('sync-state', {
      isPlaying: sessionState.isPlaying,
      currentTime: getCurrentPlaybackTime(),
      timestamp: Date.now()
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    sessionState.connectedUsers--;
    console.log(`User disconnected. Total users: ${sessionState.connectedUsers}`);
    io.emit('user-count', sessionState.connectedUsers);
  });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});