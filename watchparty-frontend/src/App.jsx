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
      rel: 0,
      playsinline: 1 // Better mobile support
    },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-4 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-2 flex items-center justify-center gap-2 sm:gap-3">
            <Video className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12" />
            Watch Party
          </h1>
          <p className="text-blue-200 text-sm sm:text-base md:text-lg px-4">
            Watch YouTube videos together in perfect sync
          </p>
        </div>

        {/* Status Bar */}
        <div className="bg-white/10 backdrop-blur-md rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto justify-center sm:justify-start">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                <span className="text-white font-medium text-sm sm:text-base">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-blue-200">
                <Users className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="font-medium text-sm sm:text-base">{userCount} watching</span>
              </div>
            </div>
          </div>
        </div>

        {/* Video Input */}
        <div className="bg-white/10 backdrop-blur-md rounded-lg p-4 sm:p-6 mb-4 sm:mb-6">
          <label className="block text-white font-medium mb-2 sm:mb-3 text-base sm:text-lg">
            Enter YouTube URL
          </label>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleLoadVideo()}
              placeholder="https://youtube.com/watch?v=..."
              className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-white/20 border border-white/30 rounded-lg text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm sm:text-base"
            />
            <button
              onClick={handleLoadVideo}
              disabled={!inputUrl.trim()}
              className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 text-sm sm:text-base"
            >
              <Video className="w-4 h-4 sm:w-5 sm:h-5" />
              Load Video
            </button>
          </div>
        </div>

        {/* Video Player */}
        {currentVideoId ? (
          <div className="bg-black rounded-lg overflow-hidden shadow-2xl mb-4 sm:mb-6">
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
            <div className="bg-gradient-to-r from-purple-800 to-blue-800 p-4 sm:p-6">
              <div className="flex items-center justify-center gap-3 sm:gap-4">
                <button
                  onClick={() => handleSeek(-10)}
                  className="p-2.5 sm:p-3 bg-white/20 hover:bg-white/30 active:bg-white/40 rounded-full transition-colors duration-200 group touch-manipulation"
                  title="Rewind 10s"
                >
                  <SkipBack className="w-5 h-5 sm:w-6 sm:h-6 text-white group-hover:scale-110 transition-transform" />
                </button>

                <button
                  onClick={handlePlayPause}
                  className="p-3 sm:p-4 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 rounded-full transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg touch-manipulation"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                  ) : (
                    <Play className="w-6 h-6 sm:w-8 sm:h-8 text-white ml-0.5 sm:ml-1" />
                  )}
                </button>

                <button
                  onClick={() => handleSeek(10)}
                  className="p-2.5 sm:p-3 bg-white/20 hover:bg-white/30 active:bg-white/40 rounded-full transition-colors duration-200 group touch-manipulation"
                  title="Forward 10s"
                >
                  <SkipForward className="w-5 h-5 sm:w-6 sm:h-6 text-white group-hover:scale-110 transition-transform" />
                </button>
              </div>
              
              <div className="text-center mt-3 sm:mt-4">
                <p className="text-blue-100 text-xs sm:text-sm px-2">
                  All controls are synchronized across all viewers
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white/10 backdrop-blur-md rounded-lg p-8 sm:p-12 text-center">
            <Video className="w-12 h-12 sm:w-16 sm:h-16 text-blue-300 mx-auto mb-3 sm:mb-4" />
            <p className="text-lg sm:text-xl text-white font-medium mb-2">No video loaded</p>
            <p className="text-blue-200 text-sm sm:text-base px-4">
              Enter a YouTube URL above to start watching together
            </p>
          </div>
        )}

        {/* Info Box */}
        <div className="bg-white/10 backdrop-blur-md rounded-lg p-4 sm:p-6 text-center">
          <p className="text-blue-100 text-xs sm:text-sm md:text-base px-2">
            🎬 Open this app in multiple tabs or share the link with friends to watch together!
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;