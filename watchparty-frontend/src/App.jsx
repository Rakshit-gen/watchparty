import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import YouTube from 'react-youtube';
import { Play, Pause, SkipForward, SkipBack, Users, Video } from 'lucide-react';

const SOCKET_URL = 'https://watchparty-c6uz.onrender.com';

function App() {
  const [socket, setSocket] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [currentVideoId, setCurrentVideoId] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const playerRef = useRef(null);
  const isSeeking = useRef(false);
  const lastSyncTime = useRef(Date.now());

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });

    // Receive initial state when joining
    newSocket.on('initial-state', (state) => {
      console.log('Received initial state:', state);
      if (state.videoId) {
        setCurrentVideoId(state.videoId);
        setVideoUrl(state.videoUrl);
        setIsPlaying(state.isPlaying);
        
        // Sync playback when player is ready
        setTimeout(() => {
          if (playerRef.current) {
            playerRef.current.seekTo(state.currentTime, true);
            if (state.isPlaying) {
              playerRef.current.playVideo();
            } else {
              playerRef.current.pauseVideo();
            }
          }
        }, 1000);
      }
    });

    // Handle video change from other users
    newSocket.on('video-changed', (data) => {
      console.log('Video changed:', data);
      setCurrentVideoId(data.videoId);
      setVideoUrl(data.videoUrl);
      setInputUrl(data.videoUrl);
      setIsPlaying(false);
    });

    // Handle play from other users
    newSocket.on('play', (currentTime) => {
      console.log('Play event received:', currentTime);
      if (playerRef.current && !isSeeking.current) {
        playerRef.current.seekTo(currentTime, true);
        playerRef.current.playVideo();
        setIsPlaying(true);
      }
    });

    // Handle pause from other users
    newSocket.on('pause', (currentTime) => {
      console.log('Pause event received:', currentTime);
      if (playerRef.current && !isSeeking.current) {
        playerRef.current.seekTo(currentTime, true);
        playerRef.current.pauseVideo();
        setIsPlaying(false);
      }
    });

    // Handle seek from other users
    newSocket.on('seek', (currentTime) => {
      console.log('Seek event received:', currentTime);
      if (playerRef.current && !isSeeking.current) {
        playerRef.current.seekTo(currentTime, true);
      }
    });

    // Handle user count updates
    newSocket.on('user-count', (count) => {
      setUserCount(count);
    });

    // Periodic sync to handle drift
    newSocket.on('sync-state', (state) => {
      const latency = Date.now() - state.timestamp;
      const adjustedTime = state.currentTime + (latency / 1000);
      
      if (playerRef.current && state.isPlaying) {
        const currentTime = playerRef.current.getCurrentTime();
        const drift = Math.abs(currentTime - adjustedTime);
        
        // Sync if drift is more than 1 second
        if (drift > 1) {
          console.log('Syncing due to drift:', drift);
          playerRef.current.seekTo(adjustedTime, true);
        }
      }
    });

    setSocket(newSocket);

    return () => newSocket.close();
  }, []);

  // Periodic sync check
  useEffect(() => {
    if (!socket || !isPlaying) return;

    const interval = setInterval(() => {
      socket.emit('request-sync');
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [socket, isPlaying]);

  const handleLoadVideo = () => {
    if (inputUrl.trim() && socket) {
      socket.emit('change-video', inputUrl.trim());
    }
  };

  const handlePlayerReady = (event) => {
    playerRef.current = event.target;
  };

  const handlePlayPause = () => {
    if (!playerRef.current || !socket) return;

    const currentTime = playerRef.current.getCurrentTime();
    
    if (isPlaying) {
      playerRef.current.pauseVideo();
      socket.emit('pause', currentTime);
      setIsPlaying(false);
    } else {
      playerRef.current.playVideo();
      socket.emit('play', currentTime);
      setIsPlaying(true);
    }
  };

  const handleSeek = (seconds) => {
    if (!playerRef.current || !socket) return;

    isSeeking.current = true;
    const currentTime = playerRef.current.getCurrentTime();
    const newTime = Math.max(0, currentTime + seconds);
    
    playerRef.current.seekTo(newTime, true);
    socket.emit('seek', newTime);
    
    setTimeout(() => {
      isSeeking.current = false;
    }, 500);
  };

  const handleStateChange = (event) => {
    // YouTube player state: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
    const state = event.data;
    
    if (state === 1 && !isPlaying) {
      setIsPlaying(true);
    } else if (state === 2 && isPlaying) {
      setIsPlaying(false);
    }
  };

  const opts = {
    height: '100%',
    width: '100%',
    playerVars: {
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      fs: 1,
      modestbranding: 1,
      rel: 0
    },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-2 flex items-center justify-center gap-3">
            <Video className="w-12 h-12" />
            Watch Party
          </h1>
          <p className="text-blue-200 text-lg">Watch YouTube videos together in perfect sync</p>
        </div>

        {/* Status Bar */}
        <div className="bg-white/10 backdrop-blur-md rounded-lg p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
              <span className="text-white font-medium">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-blue-200">
              <Users className="w-5 h-5" />
              <span className="font-medium">{userCount} watching</span>
            </div>
          </div>
        </div>

        {/* Video Input */}
        <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 mb-6">
          <label className="block text-white font-medium mb-3 text-lg">
            Enter YouTube URL
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleLoadVideo()}
              placeholder="https://www.youtube.com/watch?v=..."
              className="flex-1 px-4 py-3 bg-white/20 border border-white/30 rounded-lg text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            />
            <button
              onClick={handleLoadVideo}
              disabled={!inputUrl.trim()}
              className="px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors duration-200 flex items-center gap-2"
            >
              <Video className="w-5 h-5" />
              Load Video
            </button>
          </div>
        </div>

        {/* Video Player */}
        {currentVideoId ? (
          <div className="bg-black rounded-lg overflow-hidden shadow-2xl mb-6">
            <div className="aspect-video">
              <YouTube
                videoId={currentVideoId}
                opts={opts}
                onReady={handlePlayerReady}
                onStateChange={handleStateChange}
                className="w-full h-full"
              />
            </div>

            {/* Custom Controls */}
            <div className="bg-gradient-to-r from-purple-800 to-blue-800 p-6">
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => handleSeek(-10)}
                  className="p-3 bg-white/20 hover:bg-white/30 rounded-full transition-colors duration-200 group"
                  title="Rewind 10s"
                >
                  <SkipBack className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
                </button>

                <button
                  onClick={handlePlayPause}
                  className="p-4 bg-blue-500 hover:bg-blue-600 rounded-full transition-all duration-200 hover:scale-105 shadow-lg"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <Pause className="w-8 h-8 text-white" />
                  ) : (
                    <Play className="w-8 h-8 text-white ml-1" />
                  )}
                </button>

                <button
                  onClick={() => handleSeek(10)}
                  className="p-3 bg-white/20 hover:bg-white/30 rounded-full transition-colors duration-200 group"
                  title="Forward 10s"
                >
                  <SkipForward className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
                </button>
              </div>
              
              <div className="text-center mt-4">
                <p className="text-blue-100 text-sm">
                  All controls are synchronized across all viewers
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white/10 backdrop-blur-md rounded-lg p-12 text-center">
            <Video className="w-16 h-16 text-blue-300 mx-auto mb-4" />
            <p className="text-xl text-white font-medium mb-2">No video loaded</p>
            <p className="text-blue-200">Enter a YouTube URL above to start watching together</p>
          </div>
        )}

        {/* Info Box */}
        <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 text-center">
          <p className="text-blue-100">
            🎬 Open this app in multiple tabs or share the link with friends to watch together!
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;