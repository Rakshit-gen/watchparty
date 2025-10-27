import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, Users } from 'lucide-react';

const getYouTubeID = (url) => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

const WatchParty = () => {
  const [socket, setSocket] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [currentVideoId, setCurrentVideoId] = useState('dQw4w9WgXcQ');
  const [isPlaying, setIsPlaying] = useState(false);
  const [userCount, setUserCount] = useState(1);
  const [inputUrl, setInputUrl] = useState('');
  const playerRef = useRef(null);
  const ignoreNextUpdate = useRef(false);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3001');
    
    ws.onopen = () => {
      console.log('Connected to server');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch(data.type) {
        case 'sync':
          setCurrentVideoId(data.videoId);
          setIsPlaying(data.isPlaying);
          setUserCount(data.userCount);
          if (playerRef.current) {
            ignoreNextUpdate.current = true;
            playerRef.current.seekTo(data.currentTime);
            if (data.isPlaying) {
              playerRef.current.playVideo();
            } else {
              playerRef.current.pauseVideo();
            }
          }
          break;
          
        case 'play':
          ignoreNextUpdate.current = true;
          setIsPlaying(true);
          playerRef.current?.playVideo();
          break;
          
        case 'pause':
          ignoreNextUpdate.current = true;
          setIsPlaying(false);
          playerRef.current?.pauseVideo();
          break;
          
        case 'seek':
          ignoreNextUpdate.current = true;
          playerRef.current?.seekTo(data.time);
          break;
          
        case 'changeVideo':
          ignoreNextUpdate.current = true;
          setCurrentVideoId(data.videoId);
          setIsPlaying(false);
          if (playerRef.current && playerRef.current.loadVideoById) {
            playerRef.current.loadVideoById(data.videoId);
          }
          break;
          
        case 'userCount':
          setUserCount(data.count);
          break;
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    setSocket(ws);

    return () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }

    window.onYouTubeIframeAPIReady = () => {
      if (!playerRef.current || !playerRef.current.loadVideoById) {
        playerRef.current = new window.YT.Player('youtube-player', {
          videoId: currentVideoId,
          playerVars: {
            controls: 0,
            modestbranding: 1,
            rel: 0
          },
          events: {
            onReady: (event) => {
              console.log('Player ready');
            },
            onStateChange: (event) => {
              if (ignoreNextUpdate.current) {
                ignoreNextUpdate.current = false;
                return;
              }
              
              if (event.data === window.YT.PlayerState.PLAYING && socket) {
                socket.send(JSON.stringify({ type: 'play' }));
              } else if (event.data === window.YT.PlayerState.PAUSED && socket) {
                socket.send(JSON.stringify({ type: 'pause' }));
              }
            }
          }
        });
      }
    };

    if (window.YT && window.YT.Player && playerRef.current && playerRef.current.loadVideoById) {
      playerRef.current.loadVideoById(currentVideoId);
    }
  }, [currentVideoId, socket]);

  const handlePlay = () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'play' }));
    }
  };

  const handlePause = () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'pause' }));
    }
  };

  const handleSeek = (seconds) => {
    if (playerRef.current && socket && socket.readyState === WebSocket.OPEN) {
      const currentTime = playerRef.current.getCurrentTime();
      const newTime = Math.max(0, currentTime + seconds);
      socket.send(JSON.stringify({ type: 'seek', time: newTime }));
    }
  };

  const handleVideoChange = () => {
    const videoId = getYouTubeID(inputUrl);
    if (!videoId) {
      alert('Please enter a valid YouTube URL');
      return;
    }
    
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      alert('Not connected to server. Please wait...');
      return;
    }
    
    socket.send(JSON.stringify({ type: 'changeVideo', videoId }));
    setInputUrl('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 text-white">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">🎬 Watch Party</h1>
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full">
            <Users size={20} />
            <span className="font-semibold">{userCount} watching</span>
          </div>
        </div>

        <div className="mb-6 flex gap-2">
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="Paste YouTube URL here..."
            className="flex-1 px-4 py-3 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 focus:outline-none focus:border-white/40 placeholder-white/50"
            onKeyPress={(e) => e.key === 'Enter' && handleVideoChange()}
          />
          <button
            onClick={handleVideoChange}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors"
          >
            Load Video
          </button>
        </div>

        <div className="mb-6 rounded-xl overflow-hidden shadow-2xl bg-black">
          <div className="aspect-video">
            <div id="youtube-player" className="w-full h-full"></div>
          </div>
        </div>

        <div className="flex justify-center items-center gap-4 bg-white/10 backdrop-blur-sm p-6 rounded-xl">
          <button
            onClick={() => handleSeek(-10)}
            className="p-3 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
            title="Rewind 10s"
          >
            <SkipBack size={24} />
          </button>
          
          {isPlaying ? (
            <button
              onClick={handlePause}
              className="p-4 bg-red-600 hover:bg-red-700 rounded-full transition-colors"
            >
              <Pause size={32} />
            </button>
          ) : (
            <button
              onClick={handlePlay}
              className="p-4 bg-green-600 hover:bg-green-700 rounded-full transition-colors"
            >
              <Play size={32} />
            </button>
          )}
          
          <button
            onClick={() => handleSeek(10)}
            className="p-3 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
            title="Forward 10s"
          >
            <SkipForward size={24} />
          </button>
        </div>

        <div className="mt-8 text-center text-white/60 text-sm">
          All users are synchronized. Actions will update for everyone in real-time.
        </div>
      </div>
    </div>
  );
};

export default WatchParty;