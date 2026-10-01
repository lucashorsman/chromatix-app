// ======================================================================
// IMPORTS
// ======================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';
import * as THREE from 'three';
import clsx from 'clsx';

import { Icon } from 'js/components';
import { durationToStringMed, formatReleaseYear, getLocalStorage, setLocalStorage } from 'js/utils';
import * as bridge from 'js/services/bridge';
import * as playerX from 'js/services/player';

import style from './RecordBin3D.module.scss';

// ======================================================================
// AUDIO CUES & IMAGE PROXY
// ======================================================================

let audioCtx = null;
function playFlipSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtx) audioCtx = new AudioContextClass();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(45, audioCtx.currentTime + 0.05);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, audioCtx.currentTime);

    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.06);
  } catch (_e) {
    /* ignore */
  }
}

const getProxiedImageUrl = (url) => {
  if (!url) return null;
  if (typeof window !== 'undefined' && window.isElectron) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return '/api/proxy-image?url=' + encodeURIComponent(url);
  }
  return url;
};

// ======================================================================
// PROCEDURAL TEXTURE GENERATORS (GATEFOLD BOOKLET & CRATE PLAQUE)
// ======================================================================

function drawRoundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
}

function renderTrackCardCanvas(
  canvas,
  album,
  tracks,
  activeTrackId,
  isPlaying,
  scrollY = 0,
  hoveredTrackIdx = -1,
  isDark = true,
  scale = 1.0
) {
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (scale !== 1.0) {
    ctx.scale(scale, scale);
  }
  const w = 1024;
  const h = 1100;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Background: Frutiger Aero Aero-Glass with clean oceanic depth
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  if (isDark) {
    grad.addColorStop(0, '#061726');
    grad.addColorStop(0.35, '#030f1a');
    grad.addColorStop(1, '#01080e');
  } else {
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.18, '#f0f8fe');
    grad.addColorStop(0.65, '#e4f3fd');
    grad.addColorStop(1, '#d0ecfb');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Subtle metallic aero border
  ctx.strokeStyle = isDark ? 'rgba(0, 240, 255, 0.4)' : 'rgba(0, 150, 225, 0.45)';
  ctx.lineWidth = 5;
  ctx.strokeRect(5, 5, w - 10, h - 10);

  // Top header accent line
  ctx.fillStyle = isDark ? '#00f0ff' : '#0099e6';
  ctx.fillRect(5, 5, w - 10, 6);

  // -------------------------------------------------------------
  // HEADER: ALBUM METADATA & STATUS
  // -------------------------------------------------------------
  ctx.save();

  const fontStack = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  // Status Badge
  ctx.fillStyle = isPlaying ? (isDark ? '#00f0ff' : '#0077b6') : isDark ? '#529ab8' : '#2d607e';
  ctx.font = `bold 20px ${fontStack}`;
  ctx.fillText(isPlaying ? '● NOW PLAYING' : 'TURNTABLE READY', 48, 52);

  // Album Title (crisp bold contrast)
  ctx.fillStyle = isDark ? '#ffffff' : '#021a2d';
  ctx.font = `800 36px ${fontStack}`;
  const title = album?.title || 'No Album Selected';
  const truncTitle = title.length > 38 ? title.slice(0, 38) + '…' : title;
  ctx.fillText(truncTitle, 48, 98);

  // Artist Name
  ctx.fillStyle = isDark ? '#38d9ff' : '#006699';
  ctx.font = `700 24px ${fontStack}`;
  const artist = album?.artist || 'Unknown Artist';
  const truncArtist = artist.length > 44 ? artist.slice(0, 44) + '…' : artist;
  ctx.fillText(truncArtist, 48, 134);

  // Release Info & Totals
  ctx.fillStyle = isDark ? '#88c9e5' : '#225370';
  ctx.font = `600 19px ${fontStack}`;
  const yearStr = album?.releaseDate ? formatReleaseYear(album.releaseDate) : 'Vinyl Edition';
  const totalTrks = tracks?.length || album?.totalTracks || 0;
  const tracksStr = `${totalTrks} track${totalTrks === 1 ? '' : 's'}`;
  const durStr = album?.duration ? durationToStringMed(album.duration) : '';
  const metaLine = [yearStr, tracksStr, durStr].filter(Boolean).join(' • ');
  ctx.fillText(metaLine, 48, 168);

  // Clean Header Divider
  ctx.strokeStyle = isDark ? 'rgba(0, 240, 255, 0.2)' : 'rgba(0, 140, 215, 0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(48, 186);
  ctx.lineTo(w - 48, 186);
  ctx.stroke();

  // -------------------------------------------------------------
  // TRACKLIST HEADER
  // -------------------------------------------------------------
  ctx.fillStyle = isDark ? '#00f0ff' : '#0077b6';
  ctx.font = `bold 20px ${fontStack}`;
  ctx.fillText('TRACKLIST', 48, 218);

  if (totalTrks > 0) {
    ctx.fillStyle = isDark ? '#88c9e5' : '#225370';
    ctx.font = `700 17px ${fontStack}`;
    ctx.textAlign = 'right';
    ctx.fillText(`${totalTrks} TRACKS`, w - 48, 218);
    ctx.textAlign = 'left';
  }

  // -------------------------------------------------------------
  // INTERACTIVE SCROLLABLE TRACKLIST
  // -------------------------------------------------------------
  const viewportTop = 236;
  const viewportBottom = 1110;
  const viewportHeight = viewportBottom - viewportTop; // 874px
  const rowHeight = 56;
  const maxScroll = Math.max(0, totalTrks * rowHeight - viewportHeight);
  const scrollOffset = Math.max(0, Math.min(maxScroll, scrollY));

  if (!tracks || tracks.length === 0) {
    ctx.fillStyle = isDark ? '#529ab8' : '#336a88';
    ctx.font = `italic 22px ${fontStack}`;
    ctx.fillText('Loading track details...', 48, 300);
  } else {
    // Clip viewport area for clean scrolling
    ctx.save();
    ctx.beginPath();
    ctx.rect(36, viewportTop, w - 72, viewportHeight);
    ctx.clip();

    tracks.forEach((trk, idx) => {
      const rowY = viewportTop + idx * rowHeight - scrollOffset;
      // Skip offscreen rows
      if (rowY + rowHeight < viewportTop - 10 || rowY > viewportBottom + 10) return;

      const isTrkActive = activeTrackId && trk.trackId === activeTrackId;
      const isTrkHovered = hoveredTrackIdx === idx;

      // Row background
      if (isTrkActive) {
        ctx.fillStyle = isDark ? 'rgba(0, 240, 255, 0.18)' : 'rgba(0, 160, 235, 0.16)';
        ctx.beginPath();
        drawRoundRect(ctx, 44, rowY + 4, w - 88, 48, 8);
        ctx.fill();
        ctx.strokeStyle = isDark ? '#00f0ff' : '#0099e6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        drawRoundRect(ctx, 44, rowY + 4, w - 88, 48, 8);
        ctx.stroke();
      } else if (isTrkHovered) {
        ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 150, 220, 0.08)';
        ctx.beginPath();
        drawRoundRect(ctx, 44, rowY + 4, w - 88, 48, 8);
        ctx.fill();
        ctx.strokeStyle = isDark ? 'rgba(0, 240, 255, 0.35)' : 'rgba(0, 150, 220, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        drawRoundRect(ctx, 44, rowY + 4, w - 88, 48, 8);
        ctx.stroke();
      } else {
        // Subtle divider hairline between normal rows
        ctx.strokeStyle = isDark ? 'rgba(0, 240, 255, 0.08)' : 'rgba(0, 140, 215, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(56, rowY + rowHeight);
        ctx.lineTo(w - 56, rowY + rowHeight);
        ctx.stroke();
      }

      // Track Number or Play Indicator
      ctx.fillStyle = isTrkActive
        ? isDark
          ? '#00f0ff'
          : '#0077b6'
        : isTrkHovered
          ? isDark
            ? '#6ce5ff'
            : '#006699'
          : isDark
            ? '#5a9bb8'
            : '#2b5a75';
      ctx.font = isTrkActive ? `bold 22px ${fontStack}` : `700 20px ${fontStack}`;
      const numStr = isTrkActive && isPlaying ? '▶' : String(idx + 1).padStart(2, '0');
      ctx.fillText(numStr, 58, rowY + 34);

      // Track Title (ultra-sharp, high-contrast)
      ctx.fillStyle = isTrkActive
        ? isDark
          ? '#ffffff'
          : '#021a2d'
        : isTrkHovered
          ? isDark
            ? '#ffffff'
            : '#021a2d'
          : isDark
            ? '#ebf8ff'
            : '#041f33';
      ctx.font = isTrkActive ? `bold 22px ${fontStack}` : `600 21px ${fontStack}`;
      const rawTitle = trk.title || `Track ${idx + 1}`;
      const songTitle = rawTitle.length > 46 ? rawTitle.slice(0, 46) + '…' : rawTitle;
      ctx.fillText(songTitle, 106, rowY + 34);

      // Duration
      ctx.fillStyle = isTrkActive ? (isDark ? '#00f0ff' : '#0077b6') : isDark ? '#7dbbd4' : '#2b5a75';
      ctx.font = `600 19px ${fontStack}`;
      ctx.textAlign = 'right';
      const dur = trk.duration ? durationToStringMed(trk.duration) : '';
      ctx.fillText(dur, w - 68, rowY + 34);
      ctx.textAlign = 'left';
    });

    // Top and bottom edge gradient fade for soft transition when scrolled
    if (scrollOffset > 4) {
      const topFade = ctx.createLinearGradient(0, viewportTop, 0, viewportTop + 20);
      topFade.addColorStop(0, isDark ? '#030f1a' : '#dff2fd');
      topFade.addColorStop(1, isDark ? 'rgba(3, 15, 26, 0)' : 'rgba(223, 242, 253, 0)');
      ctx.fillStyle = topFade;
      ctx.fillRect(44, viewportTop, w - 88, 20);
    }
    if (scrollOffset < maxScroll - 4) {
      const btmFade = ctx.createLinearGradient(0, viewportBottom - 20, 0, viewportBottom);
      btmFade.addColorStop(0, isDark ? 'rgba(1, 8, 14, 0)' : 'rgba(208, 236, 251, 0)');
      btmFade.addColorStop(1, isDark ? '#01080e' : '#d0ecfb');
      ctx.fillStyle = btmFade;
      ctx.fillRect(44, viewportBottom - 20, w - 88, 20);
    }

    ctx.restore();

    // Scrollbar (if content overflows viewport)
    if (maxScroll > 0) {
      const scrollbarX = w - 52;
      const scrollbarWidth = 6;
      const scrollbarTrackHeight = viewportHeight;

      // Track groove
      ctx.fillStyle = isDark ? 'rgba(0, 240, 255, 0.1)' : 'rgba(0, 120, 190, 0.12)';
      ctx.beginPath();
      drawRoundRect(ctx, scrollbarX, viewportTop, scrollbarWidth, scrollbarTrackHeight, 3);
      ctx.fill();

      // Thumb
      const thumbHeight = Math.max(36, (viewportHeight / (totalTrks * rowHeight)) * scrollbarTrackHeight);
      const thumbY = viewportTop + (scrollOffset / maxScroll) * (scrollbarTrackHeight - thumbHeight);

      ctx.fillStyle = isDark ? 'rgba(0, 240, 255, 0.7)' : 'rgba(0, 130, 205, 0.7)';
      ctx.beginPath();
      drawRoundRect(ctx, scrollbarX, thumbY, scrollbarWidth, thumbHeight, 3);
      ctx.fill();
    }
  }

  ctx.restore();
}

// ======================================================================
// COMPONENT
// ======================================================================

export const RecordBin3D = ({ albums = [], onExit }) => {
  const history = useHistory();
  const dispatch = useDispatch();

  const containerRef = useRef(null);
  const mountRef = useRef(null);

  const playerPlaying = useSelector(({ playerModel }) => playerModel.playerPlaying);
  const playerTrackLoaded = useSelector(({ playerModel }) => playerModel.playerTrackLoaded);
  const playingAlbumId = useSelector(({ sessionModel }) => sessionModel.playingAlbumId);
  const playingTrackList = useSelector(({ sessionModel }) => sessionModel.playingTrackList);
  const playingTrackIndex = useSelector(({ sessionModel }) => sessionModel.playingTrackIndex);
  const playingTrackKeys = useSelector(({ sessionModel }) => sessionModel.playingTrackKeys);
  const currentLibrary = useSelector(({ sessionModel }) => sessionModel.currentLibrary);
  const libraryId = currentLibrary?.libraryId;

  const allAlbumTracks = useSelector(({ appModel }) => appModel.allAlbumTracks);
  const currentTrack = playingTrackList?.[playingTrackKeys[playingTrackIndex]];

  const downloaderState = useSelector(({ downloaderModel }) => downloaderModel || {});
  const isDownloading = downloaderState.isDownloading;
  const downloadProgress = downloaderState.progress;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [sceneTheme, setSceneTheme] = useState(() => {
    const saved = getLocalStorage('chromatix_record_bin_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return 'dark'; // Default to dark mode scene as requested
  });

  const isDark = sceneTheme === 'dark';

  const handleToggleTheme = useCallback(() => {
    setSceneTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      setLocalStorage('chromatix_record_bin_theme', next);
      return next;
    });
  }, []);

  const filteredAlbums = useMemo(() => {
    if (!searchQuery.trim()) return albums;
    const q = searchQuery.toLowerCase();
    return albums.filter(
      (a) => (a.title && a.title.toLowerCase().includes(q)) || (a.artist && a.artist.toLowerCase().includes(q))
    );
  }, [albums, searchQuery]);

  const currentAlbum = filteredAlbums[selectedIndex] || filteredAlbums[0];
  const currentPlayingAlbum = useMemo(() => {
    return albums.find((a) => a.albumId === playingAlbumId) || currentAlbum;
  }, [albums, playingAlbumId, currentAlbum]);

  // Request tracks for both current playing album & browsed album so booklet is always loaded
  useEffect(() => {
    if (currentAlbum && libraryId) {
      bridge.getAlbumTracks(libraryId, currentAlbum.albumId);
    }
    if (currentPlayingAlbum && libraryId && currentPlayingAlbum.albumId !== currentAlbum?.albumId) {
      bridge.getAlbumTracks(libraryId, currentPlayingAlbum.albumId);
    }
  }, [currentAlbum, currentPlayingAlbum, libraryId]);

  const playingAlbumTracks = useMemo(() => {
    return (currentPlayingAlbum && allAlbumTracks?.[libraryId + '-' + currentPlayingAlbum.albumId]) || [];
  }, [currentPlayingAlbum, allAlbumTracks, libraryId]);

  useEffect(() => {
    if (selectedIndex >= filteredAlbums.length && filteredAlbums.length > 0) {
      setSelectedIndex(filteredAlbums.length - 1);
    }
  }, [filteredAlbums.length, selectedIndex]);

  const posRef = useRef({
    target: selectedIndex,
    isDragging: false,
    dragStartX: 0,
    dragStartTarget: 0,
    lastInteractionTime: performance.now(),
  });

  const currentThemeRef = useRef(sceneTheme);
  currentThemeRef.current = sceneTheme;

  const requestRenderRef = useRef(null);
  const applyThemeRef = useRef(null);

  const stateRef = useRef({});
  stateRef.current = {
    albums,
    filteredAlbums,
    selectedIndex,
    playerPlaying,
    playerTrackLoaded,
    playingAlbumId,
    currentAlbum,
    currentPlayingAlbum,
    playingAlbumTracks,
    currentTrack,
    playingTrackKeys,
    playingTrackList,
  };

  useEffect(() => {
    requestRenderRef.current?.();
  }, [playerPlaying, playingAlbumId, currentTrack, playingAlbumTracks, selectedIndex, filteredAlbums]);

  useEffect(() => {
    if (applyThemeRef.current) {
      applyThemeRef.current(sceneTheme);
    }
  }, [sceneTheme]);

  const goToIndex = useCallback((index) => {
    posRef.current.lastInteractionTime = performance.now();
    const total = stateRef.current.filteredAlbums?.length || 1;
    const clamped = Math.max(0, Math.min(total - 1, index));
    setSelectedIndex((prev) => {
      if (clamped !== prev) {
        posRef.current.target = clamped;
        playFlipSound();
        requestRenderRef.current?.();
        return clamped;
      }
      return prev;
    });
  }, []);

  const handlePlayAlbum = useCallback(() => {
    const alb = stateRef.current.currentAlbum;
    if (!alb) return;

    const isPlaying = stateRef.current.playerPlaying;
    const isLoaded = stateRef.current.playerTrackLoaded;
    const isCurrentPlayingAlb = stateRef.current.playingAlbumId === alb.albumId;

    if (isCurrentPlayingAlb && isPlaying) {
      dispatch.playerModel.playerPause();
    } else if (isCurrentPlayingAlb && !isPlaying && isLoaded) {
      dispatch.playerModel.playerResume();
    } else {
      dispatch.playerModel.playerLoadAlbum({ albumId: alb.albumId });
    }
  }, [dispatch]);

  const handlePlayTrack = useCallback(
    (trackIndex) => {
      const alb = stateRef.current.currentPlayingAlbum || stateRef.current.currentAlbum;
      if (!alb) return;

      const playingAlbId = stateRef.current.playingAlbumId;
      const playingKeys = stateRef.current.playingTrackKeys;

      // If this album is already active in player, skip directly to trackIndex without full reload
      if (alb.albumId === playingAlbId && playingKeys && playingKeys.length > 0) {
        const keyIdx = playingKeys.indexOf(trackIndex);
        if (keyIdx !== -1) {
          dispatch.playerModel.playerLoadIndex({ index: keyIdx, play: true });
          return;
        }
      }

      // Otherwise load the album starting at trackIndex with isTrack: true
      dispatch.playerModel.playerLoadAlbum({
        albumId: alb.albumId,
        trackIndex,
        isTrack: true,
      });
    },
    [dispatch]
  );

  const handleTogglePlay = useCallback(() => {
    const isPlaying = stateRef.current.playerPlaying;
    const isLoaded = stateRef.current.playerTrackLoaded;
    const currentAlb = stateRef.current.currentPlayingAlbum || stateRef.current.currentAlbum;

    if (isPlaying) {
      dispatch.playerModel.playerPause();
      return;
    }

    if (isLoaded) {
      dispatch.playerModel.playerResume();
      return;
    }

    if (currentAlb) {
      dispatch.playerModel.playerLoadAlbum({ albumId: currentAlb.albumId });
    }
  }, [dispatch]);

  const handleNextTrack = useCallback(() => {
    dispatch.playerModel.playerNextTrack();
  }, [dispatch]);

  const handlePrevTrack = useCallback(() => {
    dispatch.playerModel.playerPrevTrack();
  }, [dispatch]);

  const handleOpenDownload = useCallback(() => {
    dispatch.dialogModel.showModal('DownloadAlbum');
  }, [dispatch]);

  const handleExit = useCallback(() => {
    if (onExit) onExit();
    else dispatch.sessionModel.setSessionState({ viewAlbums: 'grid' });
  }, [onExit, dispatch]);

  // Robust global keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      posRef.current.lastInteractionTime = performance.now();
      const currentIdx = stateRef.current.selectedIndex;
      const total = stateRef.current.filteredAlbums?.length || 0;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goToIndex(currentIdx + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goToIndex(currentIdx - 1);
      } else if (e.key === 'PageDown') {
        e.preventDefault();
        goToIndex(currentIdx + 10);
      } else if (e.key === 'PageUp') {
        e.preventDefault();
        goToIndex(currentIdx - 10);
      } else if (e.key === 'Home') {
        e.preventDefault();
        goToIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        goToIndex(total - 1);
      } else if (e.key === ' ') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handlePlayAlbum();
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        handleOpenDownload();
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        handleToggleTheme();
      } else if (e.key === 'Escape') {
        handleExit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToIndex, handleTogglePlay, handlePlayAlbum, handleOpenDownload, handleExit, handleToggleTheme]);

  // ======================================================================
  // THREE.JS GLASSHOUSE FOREST CONSERVATORY SCENE
  // Centered Record Player + Slight 3/4 Perspective + Gatefold Liner Notes
  // ======================================================================
  useEffect(() => {
    if (!mountRef.current) return;

    let animationFrameId;
    const width = mountRef.current.clientWidth || window.innerWidth;
    const height = mountRef.current.clientHeight || window.innerHeight;

    const isDark = currentThemeRef.current === 'dark';

    const scene = new THREE.Scene();
    const fogColor = isDark ? 0x031422 : 0x6ec8f5;
    scene.fog = new THREE.FogExp2(fogColor, isDark ? 0.007 : 0.005);

    // BALANCED THREE-WING PERSPECTIVE:
    // Pulled back and angled upward so both wings (crate on left, unified tracklist on right)
    // and top of records are fully framed and visible without clipping.
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.5, 1000);
    camera.position.set(0.6, 17.0, 43.0);
    camera.lookAt(0, 8.0, 1.0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isDark ? 1.08 : 1.04;

    mountRef.current.replaceChildren(renderer.domElement);

    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin('anonymous');
    const textureCache = new Map();

    const getTexture = (url) => {
      if (!url) return null;
      const targetUrl = getProxiedImageUrl(url);
      if (textureCache.has(targetUrl)) return textureCache.get(targetUrl);
      const tex = textureLoader.load(targetUrl, () => {
        tex.needsUpdate = true;
        shadowNeedsUpdate = true;
        requestRender();
      });
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      textureCache.set(targetUrl, tex);
      return tex;
    };

    // Atmospheric scene background clear color matching fog
    scene.background = new THREE.Color(fogColor);

    // High-Resolution Curved Panorama Cylinder Backdrop (exact 2:1 aspect ratio matching 2K 2048x1024 images)
    let currentBgTex = null;
    const loadBackdrop = (dark) => {
      const bgPath = dark ? '/images/nightsky2.jpg' : '/images/daysky.jpg';
      const tex = textureLoader.load(bgPath, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.wrapS = THREE.RepeatWrapping;
        t.repeat.x = -1; // Un-mirror inside view
        t.needsUpdate = true;
        if (currentBgTex && currentBgTex !== t) {
          currentBgTex.dispose();
        }
        currentBgTex = t;
        backdropMat.map = t;
        backdropMat.needsUpdate = true;
        requestRender();
      });
      return tex;
    };

    // Arc length = PI * 70 = 219.9, Height = 110 -> Aspect ratio = 219.9 / 110 = 2.0:1 (0% stretch)
    // 180° arc centered facing camera; edges at ±90° to the sides are >15° beyond camera frustum
    const backdropGeo = new THREE.CylinderGeometry(70, 70, 110, 64, 1, true, Math.PI * 0.5, Math.PI);
    const backdropMat = new THREE.MeshBasicMaterial({
      map: null,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    currentBgTex = loadBackdrop(isDark);
    backdropMat.map = currentBgTex;
    const backdropMesh = new THREE.Mesh(backdropGeo, backdropMat);
    backdropMesh.position.set(0, 14, -10);
    scene.add(backdropMesh);

    // Ambient light: Soft tropical sky azure in day, deep navy in dark mode
    const ambientLight = new THREE.AmbientLight(isDark ? 0x1a3348 : 0x7eccf5, isDark ? 0.8 : 0.95);
    scene.add(ambientLight);

    // Directional Key Moonlight / Sunlight (toned down from harsh 2.2 to prevent glare)
    const sunLight = new THREE.DirectionalLight(isDark ? 0xcde8ff : 0xfffaea, isDark ? 1.65 : 1.35);
    sunLight.position.set(28, 48, 25);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 130;
    sunLight.shadow.camera.left = -32;
    sunLight.shadow.camera.right = 32;
    sunLight.shadow.camera.top = 32;
    sunLight.shadow.camera.bottom = -32;
    sunLight.shadow.bias = -0.0003;
    scene.add(sunLight);

    // Clean neutral White/Cyan Fill Light from camera view
    const whiteFillLight = new THREE.DirectionalLight(isDark ? 0xdff0ff : 0xedf8ff, isDark ? 1.35 : 0.45);
    whiteFillLight.position.set(8, 28, 30);
    scene.add(whiteFillLight);

    // Left Front Fill specifically for the record bin covers
    const crateFillLight = new THREE.DirectionalLight(0xffffff, isDark ? 1.3 : 0.5);
    crateFillLight.position.set(-18, 25, 20);
    scene.add(crateFillLight);

    // Atmospheric Frutiger Aero Cyan Rim Light
    const rimLight = new THREE.DirectionalLight(isDark ? 0x00f0ff : 0x38c8ff, isDark ? 0.9 : 0.85);
    rimLight.position.set(0, 30, -28);
    scene.add(rimLight);

    // Floating Console Table: Glossy Frutiger Aero Sea-Glass Day / Obsidian Trench Night
    const consoleMat = new THREE.MeshPhysicalMaterial({
      color: isDark ? 0x061420 : 0x0f425c,
      roughness: isDark ? 0.18 : 0.14,
      metalness: isDark ? 0.12 : 0.08,
      clearcoat: isDark ? 0.7 : 0.92,
      clearcoatRoughness: 0.08,
    });
    const consoleMesh = new THREE.Mesh(new THREE.BoxGeometry(118, 2.2, 56), consoleMat);
    consoleMesh.position.set(0, -1.1, 0);
    consoleMesh.receiveShadow = true;
    scene.add(consoleMesh);

    // Glowing undercarriage accent trim (positioned UNDER the console, not on top!)
    const glassTrimMat = new THREE.MeshPhysicalMaterial({
      color: isDark ? 0x00f0ff : 0x00c8ff,
      roughness: 0.2,
      metalness: 0.1,
      clearcoat: 0.8,
      transparent: false,
      opacity: 1.0,
      emissive: isDark ? 0x00354a : 0x003d59,
      emissiveIntensity: isDark ? 0.5 : 0.3,
    });
    const glassTrim = new THREE.Mesh(new THREE.BoxGeometry(118.2, 0.2, 56.2), glassTrimMat);
    glassTrim.position.set(0, -2.25, 0);
    scene.add(glassTrim);

    // Solid High-Gloss Structure: Obsidian Lacquer (Night) / Polished Ceramic Enamel (Day) - Zero Transparency Overhead
    const acrylicMat = new THREE.MeshPhysicalMaterial({
      color: isDark ? 0x071926 : 0xecf6fc,
      roughness: isDark ? 0.16 : 0.12,
      metalness: isDark ? 0.12 : 0.04,
      clearcoat: 0.85,
      clearcoatRoughness: 0.08,
      transparent: false,
      opacity: 1.0,
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xf0f0f0,
      roughness: 0.12,
      metalness: 0.95,
    });

    const vinylMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.22,
      metalness: 0.45,
    });

    // ==================================================================
    // 1. CENTER HERO: HI-FI TURNTABLE WITH TACTILE START/STOP LEVER
    // ==================================================================
    const turntableGroup = new THREE.Group();
    turntableGroup.position.set(0, 0, 3.5); // Center stage!

    // Solid high-gloss plinth with chrome edge
    const ttBaseMat = new THREE.MeshPhysicalMaterial({
      color: isDark ? 0x061824 : 0xd8efff,
      roughness: isDark ? 0.14 : 0.1,
      metalness: 0.08,
      clearcoat: 0.9,
      clearcoatRoughness: 0.06,
      transparent: false,
      opacity: 1.0,
      emissive: isDark ? 0x00273d : 0x005580,
      emissiveIntensity: isDark ? 0.4 : 0.15,
    });
    const ttBase = new THREE.Mesh(new THREE.BoxGeometry(18.0, 2.0, 15.5), ttBaseMat);
    ttBase.position.set(0, 1.0, 0);
    ttBase.castShadow = true;
    ttBase.receiveShadow = true;
    turntableGroup.add(ttBase);

    // Chrome isolation feet
    const footGeo = new THREE.CylinderGeometry(0.9, 0.7, 0.6, 24);
    [
      [-7.5, -6.0],
      [7.5, -6.0],
      [-7.5, 6.0],
      [7.5, 6.0],
    ].forEach(([fx, fz]) => {
      const foot = new THREE.Mesh(footGeo, chromeMat);
      foot.position.set(fx, 0.3, fz);
      turntableGroup.add(foot);
    });

    const topPlateMat = new THREE.MeshStandardMaterial({
      color: isDark ? 0x0d202d : 0xd6eefc,
      roughness: 0.22,
      metalness: 0.82,
    });
    const topPlate = new THREE.Mesh(new THREE.BoxGeometry(17.2, 0.08, 14.8), topPlateMat);
    topPlate.position.set(0, 2.05, 0);
    turntableGroup.add(topPlate);

    const platterMat = new THREE.MeshStandardMaterial({
      color: isDark ? 0x1a2623 : 0x334440,
      roughness: 0.3,
      metalness: 0.8,
    });
    const platter = new THREE.Mesh(new THREE.CylinderGeometry(6.0, 6.0, 0.35, 48), platterMat);
    platter.position.set(-1.6, 2.35, 0);
    platter.castShadow = true;
    turntableGroup.add(platter);

    const vinylRecord = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 5.8, 0.05, 48), vinylMat);
    vinylRecord.position.set(-1.6, 2.55, 0);
    vinylRecord.castShadow = true;
    turntableGroup.add(vinylRecord);

    const centerLabelMat = new THREE.MeshStandardMaterial({
      color: isDark ? 0x1a2622 : 0xffffff,
      roughness: 0.6,
      metalness: 0.0,
    });
    const centerLabel = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.06, 32), centerLabelMat);
    centerLabel.position.set(-1.6, 2.56, 0);
    turntableGroup.add(centerLabel);

    // Tactile Physical Start/Stop Lever
    const leverBase = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 2.2), chromeMat);
    leverBase.position.set(-6.5, 2.15, 5.4);
    turntableGroup.add(leverBase);

    const leverPivot = new THREE.Group();
    leverPivot.position.set(-6.5, 2.3, 5.4);

    const leverStem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.3, 16), chromeMat);
    leverStem.position.set(0, 0.65, 0);
    leverPivot.add(leverStem);

    const jewelMat = new THREE.MeshStandardMaterial({
      color: 0x00d2ff,
      roughness: 0.1,
      metalness: 0.2,
      emissive: 0x006699,
      emissiveIntensity: 0.6,
    });
    const jewelKnob = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), jewelMat);
    jewelKnob.position.set(0, 1.35, 0);
    leverPivot.add(jewelKnob);

    turntableGroup.add(leverPivot);

    // Stationary Tonearm Base & Arm Rest Cradle
    const armBaseMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.1, 0.75, 24), chromeMat);
    armBaseMesh.position.set(5.8, 2.42, -3.8);
    armBaseMesh.castShadow = true;
    turntableGroup.add(armBaseMesh);

    const armRestPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.65, 12), chromeMat);
    armRestPillar.position.set(5.8, 2.42, 3.4);
    turntableGroup.add(armRestPillar);

    const armRestClip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.25), chromeMat);
    armRestClip.position.set(5.8, 2.76, 3.4);
    turntableGroup.add(armRestClip);

    // Connected Dynamic Tonearm & Cartridge Assembly
    const armPivotGroup = new THREE.Group();
    armPivotGroup.position.set(5.8, 2.85, -3.8);

    // Gimbal Ring & Pivot Axle
    const gimbalHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.6, 20), chromeMat);
    gimbalHousing.castShadow = true;
    armPivotGroup.add(gimbalHousing);

    const gimbalAxleGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.05, 12);
    gimbalAxleGeo.rotateZ(Math.PI / 2);
    const gimbalAxle = new THREE.Mesh(gimbalAxleGeo, chromeMat);
    armPivotGroup.add(gimbalAxle);

    // Rear Counterweight (balanced behind pivot)
    const counterStubGeo = new THREE.CylinderGeometry(0.1, 0.1, 1.8, 16);
    counterStubGeo.rotateX(Math.PI / 2);
    counterStubGeo.translate(0, 0, -0.9);
    const counterStub = new THREE.Mesh(counterStubGeo, chromeMat);
    armPivotGroup.add(counterStub);

    const counterWeightMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.35, metalness: 0.8 });
    const counterWeight = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.65, 24), counterWeightMat);
    counterWeight.rotation.x = Math.PI / 2;
    counterWeight.position.set(0, 0, -1.25);
    counterWeight.castShadow = true;
    armPivotGroup.add(counterWeight);

    // Main Tonearm Tube (originates at pivot Z=0 and extends continuously to Z=7.6)
    const armTubeGeo = new THREE.CylinderGeometry(0.08, 0.08, 7.6, 16);
    armTubeGeo.rotateX(Math.PI / 2);
    armTubeGeo.translate(0, 0, 3.8);
    const armTube = new THREE.Mesh(armTubeGeo, chromeMat);
    armTube.castShadow = true;
    armPivotGroup.add(armTube);

    // Headshell & Cartridge (seamlessly connected at front of tube, angled inward for tangential groove tracking)
    const headshellGroup = new THREE.Group();
    headshellGroup.position.set(0, 0, 7.6);
    headshellGroup.rotation.y = -0.15;
    armPivotGroup.add(headshellGroup);

    const collarGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.28, 16);
    collarGeo.rotateX(Math.PI / 2);
    collarGeo.translate(0, 0, 0.14);
    const collar = new THREE.Mesh(collarGeo, chromeMat);
    headshellGroup.add(collar);

    const headshellPlateMat = new THREE.MeshStandardMaterial({
      color: isDark ? 0x121e1b : 0x1a2421,
      roughness: 0.3,
      metalness: 0.7,
    });
    const headshellPlate = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 1.1), headshellPlateMat);
    headshellPlate.position.set(0, 0.02, 0.72);
    headshellPlate.castShadow = true;
    headshellGroup.add(headshellPlate);

    const fingerLiftGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.45, 8);
    fingerLiftGeo.rotateZ(Math.PI / 3);
    const fingerLift = new THREE.Mesh(fingerLiftGeo, chromeMat);
    fingerLift.position.set(0.35, 0.08, 0.85);
    headshellGroup.add(fingerLift);

    const cartridgeBodyMat = new THREE.MeshStandardMaterial({ color: 0x182420, roughness: 0.35, metalness: 0.6 });
    const cartridgeBody = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.75), cartridgeBodyMat);
    cartridgeBody.position.set(0, -0.11, 0.72);
    cartridgeBody.castShadow = true;
    headshellGroup.add(cartridgeBody);

    const stylusGuardMat = new THREE.MeshStandardMaterial({
      color: isDark ? 0x00f0ff : 0x00a8e8,
      roughness: 0.2,
      metalness: 0.3,
    });
    const stylusGuard = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.3), stylusGuardMat);
    stylusGuard.position.set(0, -0.16, 0.95);
    headshellGroup.add(stylusGuard);

    const cantileverGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8);
    cantileverGeo.rotateX(Math.PI / 4);
    const cantilever = new THREE.Mesh(cantileverGeo, chromeMat);
    cantilever.position.set(0, -0.22, 1.02);
    headshellGroup.add(cantilever);

    const needleTip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 8), chromeMat);
    needleTip.position.set(0, -0.27, 1.08);
    needleTip.rotation.x = Math.PI;
    headshellGroup.add(needleTip);

    turntableGroup.add(armPivotGroup);
    scene.add(turntableGroup);

    // ==================================================================
    // 2. NOW SPON EASEL (PROUDLY PROPPED BEHIND TURNTABLE)
    // ==================================================================
    const easelGroup = new THREE.Group();
    easelGroup.position.set(-1.0, 5.4, -7.2); // Positioned directly behind the turntable, raised up!

    const easelBase = new THREE.Mesh(new THREE.BoxGeometry(14.2, 0.6, 8.0), acrylicMat);
    easelBase.position.set(0, 0.3, 0);
    easelBase.castShadow = true;
    easelGroup.add(easelBase);

    const easelUprightLeft = new THREE.Mesh(new THREE.BoxGeometry(0.8, 14.0, 0.6), acrylicMat);
    easelUprightLeft.position.set(-4.5, 7.0, -1.0);
    easelUprightLeft.rotation.x = -0.14;
    easelUprightLeft.castShadow = true;
    easelGroup.add(easelUprightLeft);

    const easelUprightRight = new THREE.Mesh(new THREE.BoxGeometry(0.8, 14.0, 0.6), acrylicMat);
    easelUprightRight.position.set(4.5, 7.0, -1.0);
    easelUprightRight.rotation.x = -0.14;
    easelUprightRight.castShadow = true;
    easelGroup.add(easelUprightRight);

    const easelLip = new THREE.Mesh(new THREE.BoxGeometry(14.0, 1.2, 0.8), acrylicMat);
    easelLip.position.set(0, 0.9, 3.2);
    easelLip.castShadow = true;
    easelGroup.add(easelLip);

    const sleeveGeometry = new THREE.BoxGeometry(12.4, 12.4, 0.2);
    const heroSpineMat = new THREE.MeshStandardMaterial({ color: 0x22332e, roughness: 0.7 });
    const heroFrontMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.02 });
    const heroBackMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.02 });

    const heroSleeve = new THREE.Mesh(sleeveGeometry, [
      heroSpineMat,
      heroSpineMat,
      heroSpineMat,
      heroSpineMat,
      heroFrontMat,
      heroBackMat,
    ]);
    heroSleeve.position.set(0, 7.2, 0.2);
    heroSleeve.rotation.x = -0.14;
    heroSleeve.castShadow = true;
    heroSleeve.receiveShadow = true;
    easelGroup.add(heroSleeve);

    scene.add(easelGroup);

    // ==================================================================
    // 3. LEFT WING: ACRYLIC RECORD CRATE (BROWSING BIN)
    // ==================================================================
    const crateGroup = new THREE.Group();
    crateGroup.position.set(-15.8, 0, 1.5);

    const crateBottom = new THREE.Mesh(new THREE.BoxGeometry(15.5, 0.5, 28), acrylicMat);
    crateBottom.position.set(0, 0.25, 0);
    crateBottom.receiveShadow = true;
    crateGroup.add(crateBottom);

    const crateLeftSide = new THREE.Mesh(new THREE.BoxGeometry(0.7, 8.5, 28), acrylicMat);
    crateLeftSide.position.set(-7.75, 4.5, 0);
    crateLeftSide.castShadow = true;
    crateLeftSide.receiveShadow = true;
    crateGroup.add(crateLeftSide);

    const crateRightSide = new THREE.Mesh(new THREE.BoxGeometry(0.7, 8.5, 28), acrylicMat);
    crateRightSide.position.set(7.75, 4.5, 0);
    crateRightSide.castShadow = true;
    crateRightSide.receiveShadow = true;
    crateGroup.add(crateRightSide);

    const crateBack = new THREE.Mesh(new THREE.BoxGeometry(16.2, 8.5, 0.7), acrylicMat);
    crateBack.position.set(0, 4.5, -14);
    crateBack.castShadow = true;
    crateBack.receiveShadow = true;
    crateGroup.add(crateBack);

    // Crate Front Lip
    const crateFront = new THREE.Mesh(new THREE.BoxGeometry(16.2, 2.5, 0.7), acrylicMat);
    crateFront.position.set(0, 1.5, 14);
    crateFront.castShadow = true;
    crateFront.receiveShadow = true;
    crateGroup.add(crateFront);

    scene.add(crateGroup);

    // ==================================================================
    // 4. RIGHT WING: PROMINENT UNIFIED TRACKLIST CARD
    // ==================================================================
    const trackCardGroup = new THREE.Group();
    trackCardGroup.position.set(17, 0.25, 2.5);
    trackCardGroup.rotation.x = -0.15; // Comfortable tilted angle facing camera
    trackCardGroup.rotation.y = -0.16;

    const calculateCardScale = (h) => {
      const dpr = Math.min(window.devicePixelRatio, 1.35);
      const projectedPx = h * 0.59 * dpr;
      return Math.min(1.0, Math.max(0.45, projectedPx / 1100));
    };

    let cardScale = calculateCardScale(height);

    const trackCardCanvas = document.createElement('canvas');
    trackCardCanvas.width = Math.round(1024 * cardScale);
    trackCardCanvas.height = Math.round(1100 * cardScale);
    renderTrackCardCanvas(
      trackCardCanvas,
      currentPlayingAlbum,
      playingAlbumTracks,
      currentTrack?.trackId,
      playerPlaying,
      0,
      -1,
      isDark,
      cardScale
    );

    const trackCardTex = new THREE.CanvasTexture(trackCardCanvas);
    trackCardTex.colorSpace = THREE.SRGBColorSpace;
    trackCardTex.generateMipmaps = true;
    trackCardTex.minFilter = THREE.LinearMipmapLinearFilter;
    trackCardTex.magFilter = THREE.LinearFilter;
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 16;
    trackCardTex.anisotropy = Math.min(4, maxAnisotropy);

    const trackCardMat = new THREE.MeshStandardMaterial({
      map: trackCardTex,
      roughness: 0.28,
      metalness: 0.05,
    });
    const cardEdgeMat = new THREE.MeshStandardMaterial({
      color: isDark ? 0x00f0ff : 0x0099cc,
      roughness: 0.45,
    });
    const cardBackMat = new THREE.MeshPhysicalMaterial({
      color: isDark ? 0x041420 : 0xe6f5ff,
      roughness: 0.15,
      metalness: 0.05,
      clearcoat: 0.9,
    });

    const trackCardMesh = new THREE.Mesh(new THREE.BoxGeometry(15.2, 17.0, 0.22), [
      cardEdgeMat,
      cardEdgeMat,
      cardEdgeMat,
      cardEdgeMat,
      trackCardMat,
      cardBackMat,
    ]);
    trackCardMesh.position.set(0, 8.5, 0);
    trackCardMesh.castShadow = true;
    trackCardMesh.receiveShadow = true;
    trackCardGroup.add(trackCardMesh);

    scene.add(trackCardGroup);

    // ==================================================================
    // 5. SLEEVES POOL (Cascading in Left Wing Acrylic Rack)
    // ==================================================================
    const MAX_VISIBLE_SLEEVES = 28;
    const rackSleeveGeo = new THREE.BoxGeometry(11.8, 11.8, 0.16);
    rackSleeveGeo.clearGroups();
    rackSleeveGeo.addGroup(0, 24, 0); // +x,-x,+y,-y -> spine
    rackSleeveGeo.addGroup(24, 6, 1); // +z -> front
    rackSleeveGeo.addGroup(30, 6, 2); // -z -> back
    const sleevePool = [];

    for (let i = 0; i < MAX_VISIBLE_SLEEVES; i++) {
      const spineMat = new THREE.MeshStandardMaterial({
        color: 0x223530,
        roughness: 0.8,
        depthWrite: true,
        transparent: false,
        opacity: 1.0,
      });
      const frontMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.35,
        metalness: 0.02,
        depthWrite: true,
        transparent: false,
        opacity: 1.0,
      });
      const backMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.45,
        metalness: 0.02,
        depthWrite: true,
        transparent: false,
        opacity: 1.0,
      });
      const materials = [spineMat, frontMat, backMat];
      const sleeveMesh = new THREE.Mesh(rackSleeveGeo, materials);
      sleeveMesh.castShadow = false;
      sleeveMesh.receiveShadow = true;
      sleeveMesh.visible = false;
      crateGroup.add(sleeveMesh);

      sleevePool.push({ mesh: sleeveMesh, frontMat, backMat, spineMat, albumIndex: -1 });
    }

    const applyTheme = (theme) => {
      const dark = theme === 'dark';
      const fogCol = dark ? 0x031422 : 0x6ec8f5;
      scene.fog.color.setHex(fogCol);
      scene.fog.density = dark ? 0.007 : 0.005;
      scene.background.setHex(fogCol);

      renderer.toneMappingExposure = dark ? 1.08 : 1.04;
      loadBackdrop(dark);

      ambientLight.color.setHex(dark ? 0x1a3348 : 0x7eccf5);
      ambientLight.intensity = dark ? 0.8 : 0.95;

      sunLight.color.setHex(dark ? 0xcde8ff : 0xfffaea);
      sunLight.intensity = dark ? 1.65 : 1.35;

      whiteFillLight.color.setHex(dark ? 0xdff0ff : 0xedf8ff);
      whiteFillLight.intensity = dark ? 1.35 : 0.45;

      crateFillLight.intensity = dark ? 1.3 : 0.5;

      rimLight.color.setHex(dark ? 0x00f0ff : 0x38c8ff);
      rimLight.intensity = dark ? 0.9 : 0.85;

      consoleMat.color.setHex(dark ? 0x061420 : 0x0f425c);
      consoleMat.roughness = dark ? 0.18 : 0.14;
      consoleMat.metalness = dark ? 0.12 : 0.08;
      consoleMat.clearcoat = dark ? 0.7 : 0.92;

      glassTrimMat.color.setHex(dark ? 0x00f0ff : 0x00c8ff);
      glassTrimMat.emissive.setHex(dark ? 0x00354a : 0x003d59);
      glassTrimMat.emissiveIntensity = dark ? 0.5 : 0.3;

      acrylicMat.color.setHex(dark ? 0x071926 : 0xecf6fc);
      acrylicMat.roughness = dark ? 0.16 : 0.12;
      acrylicMat.metalness = dark ? 0.12 : 0.04;

      ttBaseMat.color.setHex(dark ? 0x061824 : 0xd8efff);
      ttBaseMat.roughness = dark ? 0.14 : 0.1;
      ttBaseMat.emissive.setHex(dark ? 0x00273d : 0x005580);
      ttBaseMat.emissiveIntensity = dark ? 0.4 : 0.15;

      topPlateMat.color.setHex(dark ? 0x0d202d : 0xd6eefc);
      platterMat.color.setHex(dark ? 0x1a2623 : 0x334440);
      centerLabelMat.color.setHex(dark ? 0x1a2622 : 0xffffff);
      headshellPlateMat.color.setHex(dark ? 0x121e1b : 0x1a2421);
      stylusGuardMat.color.setHex(dark ? 0x00f0ff : 0x00a8e8);
      cardEdgeMat.color.setHex(dark ? 0x00f0ff : 0x0099cc);
      cardBackMat.color.setHex(dark ? 0x041420 : 0xe6f5ff);

      shadowNeedsUpdate = true;
      lastRenderedTheme = null;
      requestRender();
    };
    applyThemeRef.current = applyTheme;

    let continuousPos = posRef.current.target;
    let targetArmRotation = 0.0;
    let currentArmRotation = 0.0;
    let targetArmTiltX = -0.04;
    let currentArmTiltX = -0.04;

    let shadowNeedsUpdate = true;
    let isLoopRunning = false;
    let needsRender = true;
    let lastRenderedTheme = isDark;

    const requestRender = () => {
      needsRender = true;
      if (!isLoopRunning) {
        isLoopRunning = true;
        lastFrameTime = performance.now();
        animationFrameId = requestAnimationFrame(animate);
      }
    };
    requestRenderRef.current = requestRender;

    let cachedTracksRef = null;
    let cachedTotalDurationMs = 0;
    let cachedCumulativeDurations = [];

    // Track previous rendered data to avoid unnecessary canvas repainting
    let lastRenderedAlbumId = null;
    let lastRenderedPlayingAlbumId = null;
    let lastRenderedTrackId = null;
    let lastRenderedPlayingState = null;
    let lastRenderedTracksCount = 0;
    let lastRenderedScroll = -999;
    let lastRenderedHoverIdx = -1;
    let lastAlbumIdForScroll = null;
    let lastActiveTrackIdForScroll = null;

    const cardScrollTarget = { current: 0 };
    const cardScrollCurrent = { current: 0 };
    const cardDragRef = {
      current: {
        isDragging: false,
        startY: 0,
        startX: 0,
        startScroll: 0,
        dragDistance: 0,
        wasDrag: false,
      },
    };
    const hoveredTrackIndexRef = { current: -1 };

    let currentLiftScale = 1.0;
    const IDLE_TIMEOUT_MS = 1000;
    let lastPointerX = 0;
    let lastPointerY = 0;

    // 60 FPS Frame Rate Pacing (prevents running unthrottled at 144Hz/240Hz)
    let lastFrameTime = performance.now();
    const TARGET_FRAME_MS = 1000 / 30;

    // Continuous Animation Loop
    const animate = (currentTime) => {
      if (!isLoopRunning) return;

      if (currentTime) {
        const elapsed = currentTime - lastFrameTime;
        if (elapsed < TARGET_FRAME_MS - 1.5) {
          animationFrameId = requestAnimationFrame(animate);
          return;
        }
        lastFrameTime = currentTime - (elapsed % TARGET_FRAME_MS);
      }

      const state = stateRef.current;
      const filtered = state.filteredAlbums || [];
      const totalAlbums = filtered.length;

      const diff = posRef.current.target - continuousPos;
      if (Math.abs(diff) > 0.001) {
        continuousPos += diff * 0.18;
      } else {
        continuousPos = posRef.current.target;
      }

      // Smooth inertia scrolling for the tracklist card
      const scrollDiff = cardScrollTarget.current - cardScrollCurrent.current;
      if (Math.abs(scrollDiff) > 0.05) {
        cardScrollCurrent.current += scrollDiff * 0.22;
      } else {
        cardScrollCurrent.current = cardScrollTarget.current;
      }

      // Dynamic active record elevation with idle-timeout descent
      const now = performance.now();
      const isMoving =
        Math.abs(continuousPos - posRef.current.target) > 0.015 ||
        posRef.current.isDragging ||
        cardDragRef.current.isDragging;
      if (isMoving) {
        posRef.current.lastInteractionTime = now;
      }

      const idleElapsed = now - (posRef.current.lastInteractionTime || now);
      const isIdle = idleElapsed > IDLE_TIMEOUT_MS;
      const targetLiftScale = isIdle ? 0.0 : 1.0;
      currentLiftScale += (targetLiftScale - currentLiftScale) * 0.055;

      // Turntable animation & physical lever
      if (state.playerPlaying) {
        platter.rotation.y -= 0.035;
        vinylRecord.rotation.y -= 0.035;
        centerLabel.rotation.y -= 0.035;

        // Dynamic needle tracking across record grooves as a function of total album length & track progress
        let albumProgress = 0;
        const trks = state.playingAlbumTracks || [];
        const curTrk = state.currentTrack;
        const curTrkId = curTrk?.trackId;
        const currentProgressSec = playerX.getCurrentProgress() || 0;
        const currentProgressMs = currentProgressSec * 1000;

        if (trks.length > 0 && curTrkId) {
          const activeIdx = trks.findIndex((t) => t.trackId === curTrkId);
          if (activeIdx !== -1) {
            if (cachedTracksRef !== trks) {
              cachedTracksRef = trks;
              cachedCumulativeDurations = [];
              let cum = 0;
              for (let i = 0; i < trks.length; i++) {
                cachedCumulativeDurations.push(cum);
                cum += trks[i].duration || 0;
              }
              cachedTotalDurationMs = cum;
            }
            const priorDurationMs = cachedCumulativeDurations[activeIdx] || 0;
            const totalDurationMs = cachedTotalDurationMs;
            const curDurationMs = trks[activeIdx]?.duration || curTrk?.duration || 0;
            const currentSongElapsedMs =
              curDurationMs > 0 ? Math.min(currentProgressMs, curDurationMs) : currentProgressMs;
            const elapsedAlbumMs = priorDurationMs + currentSongElapsedMs;

            albumProgress = totalDurationMs > 0 ? Math.min(1.0, Math.max(0.0, elapsedAlbumMs / totalDurationMs)) : 0;
          } else if (curTrk?.duration) {
            albumProgress = Math.min(1.0, Math.max(0.0, currentProgressMs / curTrk.duration));
          }
        } else if (curTrk?.duration) {
          albumProgress = Math.min(1.0, Math.max(0.0, currentProgressMs / curTrk.duration));
        }

        // Start groove (lead-in) at -0.42 rad -> End groove (run-out) at -0.80 rad
        targetArmRotation = THREE.MathUtils.lerp(-0.42, -0.8, albumProgress);
        targetArmTiltX = 0.0; // Needle gently lowered onto vinyl grooves
        leverPivot.rotation.x = THREE.MathUtils.lerp(leverPivot.rotation.x, 0.35, 0.1);
        jewelMat.emissiveIntensity = 0.8;
      } else {
        targetArmRotation = 0.0; // Rest position on cradle
        targetArmTiltX = -0.04; // Cueing lever lifted
        leverPivot.rotation.x = THREE.MathUtils.lerp(leverPivot.rotation.x, 0, 0.1);
        jewelMat.emissiveIntensity = 0.3;
      }
      currentArmRotation += (targetArmRotation - currentArmRotation) * 0.04;
      currentArmTiltX += (targetArmTiltX - currentArmTiltX) * 0.06;
      armPivotGroup.rotation.y = currentArmRotation;
      armPivotGroup.rotation.x = currentArmTiltX;

      // Update Tracklist Card Canvas when playing album, track, scroll, or hover changes
      const playingAlb = state.currentPlayingAlbum;
      const trks = state.playingAlbumTracks || [];
      const curTrk = state.currentTrack;
      const curTrkId = curTrk?.trackId;
      const isPlay = state.playerPlaying;
      const scrollPos = cardScrollCurrent.current;
      const hovIdx = hoveredTrackIndexRef.current;

      // Reset scroll if album changed
      if (playingAlb?.albumId !== lastAlbumIdForScroll) {
        lastAlbumIdForScroll = playingAlb?.albumId;
        cardScrollTarget.current = 0;
        cardScrollCurrent.current = 0;
      }

      // Auto-scroll to keep active playing track visible when track changes
      if (curTrkId && curTrkId !== lastActiveTrackIdForScroll) {
        lastActiveTrackIdForScroll = curTrkId;
        const activeIdx = trks.findIndex((t) => t.trackId === curTrkId);
        if (activeIdx !== -1) {
          const trackTop = activeIdx * 56;
          const viewportHeight = 874;
          const maxScroll = Math.max(0, trks.length * 56 - viewportHeight);
          if (trackTop < cardScrollTarget.current || trackTop + 56 > cardScrollTarget.current + viewportHeight) {
            cardScrollTarget.current = Math.max(0, Math.min(maxScroll, trackTop - 56));
          }
        }
      }

      const roundedScroll = Math.round(scrollPos);
      const isCurrentDark = currentThemeRef.current === 'dark';

      const needsCardUpdate =
        playingAlb?.albumId !== lastRenderedPlayingAlbumId ||
        curTrkId !== lastRenderedTrackId ||
        isPlay !== lastRenderedPlayingState ||
        trks.length !== lastRenderedTracksCount ||
        Math.abs(roundedScroll - lastRenderedScroll) >= 1 ||
        hovIdx !== lastRenderedHoverIdx ||
        isCurrentDark !== lastRenderedTheme;

      if (needsCardUpdate) {
        lastRenderedPlayingAlbumId = playingAlb?.albumId;
        lastRenderedTrackId = curTrkId;
        lastRenderedPlayingState = isPlay;
        lastRenderedTracksCount = trks.length;
        lastRenderedScroll = roundedScroll;
        lastRenderedHoverIdx = hovIdx;
        lastRenderedTheme = isCurrentDark;

        renderTrackCardCanvas(
          trackCardCanvas,
          playingAlb,
          trks,
          curTrkId,
          isPlay,
          roundedScroll,
          hovIdx,
          isCurrentDark,
          cardScale
        );
        trackCardTex.needsUpdate = true;
      }

      // The easel showcases the album currently playing!
      const currentPlayingAlbum = state.albums?.find((a) => a.albumId === state.playingAlbumId) || playingAlb;
      const easelThumb = currentPlayingAlbum?.thumbMd || currentPlayingAlbum?.thumbSm;
      if (easelThumb) {
        const tex = getTexture(easelThumb);
        if (tex) {
          if (heroFrontMat.map !== tex) {
            heroFrontMat.map = tex;
            heroFrontMat.needsUpdate = true;
            shadowNeedsUpdate = true;
          }
          if (heroBackMat.map !== tex) {
            heroBackMat.map = tex;
            heroBackMat.needsUpdate = true;
            shadowNeedsUpdate = true;
          }
          if (centerLabelMat.map !== tex) {
            centerLabelMat.map = tex;
            centerLabelMat.needsUpdate = true;
            shadowNeedsUpdate = true;
          }
        }
      }

      if (totalAlbums === 0) {
        sleevePool.forEach((item) => (item.mesh.visible = false));
        if (shadowNeedsUpdate) {
          renderer.shadowMap.needsUpdate = true;
          shadowNeedsUpdate = false;
        }
        renderer.render(scene, camera);
        if (needsRender) {
          needsRender = false;
          animationFrameId = requestAnimationFrame(animate);
        } else {
          isLoopRunning = false;
        }
        return;
      }

      // Position Sleeves in the Acrylic Rack (Asymmetrical: 3 Front, 20 Rear)
      const centerIdx = Math.round(continuousPos);
      const frontWindow = 3;
      const rearWindow = 20;
      const startIdx = Math.max(0, centerIdx - frontWindow);
      const endIdx = Math.min(totalAlbums - 1, centerIdx + rearWindow);

      let poolPtr = 0;

      for (let idx = startIdx; idx <= endIdx; idx++) {
        if (poolPtr >= MAX_VISIBLE_SLEEVES) break;
        const item = sleevePool[poolPtr++];
        const album = filtered[idx];
        item.mesh.visible = true;
        item.albumIndex = idx;

        const thumbUrl = album?.thumbMd || album?.thumbSm;
        if (thumbUrl) {
          const tex = getTexture(thumbUrl);
          if (tex) {
            if (item.frontMat.map !== tex) {
              item.frontMat.map = tex;
              item.frontMat.needsUpdate = true;
            }
            if (item.backMat.map !== tex) {
              item.backMat.map = tex;
              item.backMat.needsUpdate = true;
            }
          }
        }

        // Arrangement in the transparent acrylic rack
        const delta = idx - continuousPos;
        let targetZ = 0;
        let targetRotX = -0.18;
        let targetY = 5.95;
        let alpha = 1.0;

        if (delta < -0.2) {
          // Records already flipped past into the front stack (steep forward rake, low resting height)
          const flipOffset = -delta - 0.2;
          targetZ = 0.44 + Math.min(9.5, flipOffset * 2.4);
          targetY = 3.8;
          targetRotX = 0.48; // Leans forward low against the front acrylic lip

          if (flipOffset > 2.2) {
            // Only the final outermost record entering/exiting the crate dissolves
            const fadeProgress = THREE.MathUtils.clamp((flipOffset - 2.2) / 1.0, 0, 1);
            alpha = 1.0 - THREE.MathUtils.smoothstep(fadeProgress, 0, 1);
          }
        } else if (delta > 0.2) {
          // Records waiting in back of crate
          const waitOffset = delta - 0.2;
          targetZ = -1.2 - waitOffset * 0.55;
          targetY = 5.95;
          targetRotX = -0.18;

          if (waitOffset > 18.5) {
            // Only the final rearmost record entering/exiting the queue dissolves
            const rearFadeProgress = THREE.MathUtils.clamp((waitOffset - 18.5) / 1.6, 0, 1);
            alpha = 1.0 - THREE.MathUtils.smoothstep(rearFadeProgress, 0, 1);
          }
        } else {
          // Active record inspected in the center of the crate
          const lift = Math.max(0, 1.0 - Math.abs(delta) * 5.0);
          const effectiveLift = lift * currentLiftScale;
          const baseCenterY = 5.95 + effectiveLift * 6.6;
          targetZ = 0.7 * effectiveLift - delta * 2.2;

          // When active/raised, face the camera line of sight directly (-0.18 rad)
          // Smoothly tilt forward to +0.48 and settle to Y=3.8 as it leaves center into the front stack
          if (delta < 0) {
            const tiltProgress = Math.pow(-delta / 0.2, 1.4);
            targetRotX = THREE.MathUtils.lerp(-0.18, 0.48, tiltProgress);
            targetY = THREE.MathUtils.lerp(baseCenterY, 3.8, tiltProgress);
          } else {
            targetRotX = -0.18;
            targetY = baseCenterY;
          }
        }

        item.mesh.scale.set(1, 1, 1);
        item.mesh.position.set(0, targetY, targetZ);
        item.mesh.rotation.x = targetRotX;

        // Apply alpha transparency and depth-write mask only when fading
        const fading = alpha < 0.999;
        const mats = [item.spineMat, item.frontMat, item.backMat];
        for (const m of mats) {
          m.opacity = alpha;
          m.depthWrite = alpha > 0.85;
          if (m.transparent !== fading) {
            m.transparent = fading;
            m.needsUpdate = true;
          }
        }
      }

      while (poolPtr < MAX_VISIBLE_SLEEVES) {
        const unused = sleevePool[poolPtr++];
        unused.mesh.visible = false;
        unused.mesh.scale.set(1, 1, 1);
        const unusedMats = [unused.spineMat, unused.frontMat, unused.backMat];
        for (const m of unusedMats) {
          m.opacity = 1.0;
          m.depthWrite = true;
          if (m.transparent) {
            m.transparent = false;
            m.needsUpdate = true;
          }
        }
      }

      const armIsMoving =
        Math.abs(targetArmRotation - currentArmRotation) > 0.0005 ||
        Math.abs(targetArmTiltX - currentArmTiltX) > 0.0005 ||
        (state.playerPlaying && Math.abs(leverPivot.rotation.x - 0.35) > 0.01) ||
        (!state.playerPlaying && Math.abs(leverPivot.rotation.x) > 0.01);

      if (armIsMoving) {
        shadowNeedsUpdate = true;
      }

      if (shadowNeedsUpdate) {
        renderer.shadowMap.needsUpdate = true;
        shadowNeedsUpdate = false;
      }

      renderer.render(scene, camera);

      const isPlaying = state.playerPlaying;
      const isCrateMoving = Math.abs(posRef.current.target - continuousPos) > 0.001 || posRef.current.isDragging;
      const isCardScrolling =
        Math.abs(cardScrollTarget.current - cardScrollCurrent.current) > 0.05 || cardDragRef.current.isDragging;
      const isLiftMoving = Math.abs(targetLiftScale - currentLiftScale) > 0.001;

      const shouldKeepRendering =
        isPlaying || isCrateMoving || isCardScrolling || isLiftMoving || armIsMoving || needsRender;

      if (shouldKeepRendering) {
        needsRender = false;
        animationFrameId = requestAnimationFrame(animate);
      } else {
        isLoopRunning = false;
      }
    };

    requestRender();

    const canvas = renderer.domElement;

    const onPointerDown = (e) => {
      posRef.current.lastInteractionTime = performance.now();
      requestRender();
      const rect = canvas.getBoundingClientRect();
      mouseVector.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseVector.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      raycaster.setFromCamera(mouseVector, camera);

      // 1. Check if clicking on the Unified Tracklist Card
      const cardHits = raycaster.intersectObject(trackCardMesh, false);
      if (cardHits.length > 0) {
        cardDragRef.current = {
          isDragging: true,
          startY: e.clientY,
          startX: e.clientX,
          startScroll: cardScrollTarget.current,
          dragDistance: 0,
          wasDrag: false,
        };
        posRef.current.isDragging = false;
        return;
      }

      // 2. Check if clicking Turntable controls, Hero Easel, or Tonearm
      const interactiveHits = raycaster.intersectObjects(
        [platter, vinylRecord, leverBase, jewelKnob, heroSleeve, armPivotGroup],
        true
      );
      if (interactiveHits.length > 0) {
        posRef.current.isDragging = false;
        return;
      }

      posRef.current.isDragging = true;
      posRef.current.dragStartX = e.clientX;
      posRef.current.dragStartTarget = posRef.current.target;
    };

    const onPointerMove = (e) => {
      const dist = Math.hypot(e.clientX - lastPointerX, e.clientY - lastPointerY);
      if (dist > 3) {
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;
        posRef.current.lastInteractionTime = performance.now();
      }

      const rect = canvas.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      // Subtle baseline parallax
      camera.position.x = 0.6 + nx * 1.5;
      camera.position.y = 17.0 + ny * 1.0;
      camera.position.z = 43.0;
      camera.lookAt(0, 8.0, 1.0);
      requestRender();

      // Handle card dragging (smooth vertical scrolling of tracklist on card surface)
      if (cardDragRef.current.isDragging) {
        const deltaY = e.clientY - cardDragRef.current.startY;
        const deltaX = e.clientX - cardDragRef.current.startX;
        cardDragRef.current.dragDistance = Math.hypot(deltaX, deltaY);

        const trks = stateRef.current.playingAlbumTracks || [];
        const totalTracks = trks.length;
        const viewportHeight = 874;
        const rowHeight = 56;
        const maxScroll = Math.max(0, totalTracks * rowHeight - viewportHeight);

        if (maxScroll > 0) {
          const scrollDelta = -deltaY * 1.5;
          cardScrollTarget.current = Math.max(0, Math.min(maxScroll, cardDragRef.current.startScroll + scrollDelta));
          requestRender();
        }
        return;
      }

      // Check hover on tracklist card
      mouseVector.x = nx;
      mouseVector.y = ny;
      raycaster.setFromCamera(mouseVector, camera);

      const cardHits = raycaster.intersectObject(trackCardMesh, false);
      if (cardHits.length > 0 && cardHits[0].uv) {
        const uv = cardHits[0].uv;
        const canvasX = uv.x * 1024;
        const canvasY = (1 - uv.y) * 1100;

        const viewportTop = 236;
        const viewportBottom = 1110;
        const rowHeight = 56;
        const trks = stateRef.current.playingAlbumTracks || [];

        if (canvasY >= viewportTop && canvasY <= viewportBottom) {
          const relY = canvasY - viewportTop + cardScrollCurrent.current;
          const hovIdx = Math.floor(relY / rowHeight);
          if (hovIdx >= 0 && hovIdx < trks.length) {
            if (hoveredTrackIndexRef.current !== hovIdx) {
              hoveredTrackIndexRef.current = hovIdx;
              requestRender();
            }
            canvas.style.cursor = 'pointer';
          } else {
            if (hoveredTrackIndexRef.current !== -1) {
              hoveredTrackIndexRef.current = -1;
              requestRender();
            }
            canvas.style.cursor = 'default';
          }
        } else if (canvasY < viewportTop) {
          if (hoveredTrackIndexRef.current !== -1) {
            hoveredTrackIndexRef.current = -1;
            requestRender();
          }
          canvas.style.cursor = 'pointer';
        } else {
          if (hoveredTrackIndexRef.current !== -1) {
            hoveredTrackIndexRef.current = -1;
            requestRender();
          }
          canvas.style.cursor = 'default';
        }
      } else {
        if (hoveredTrackIndexRef.current !== -1) {
          hoveredTrackIndexRef.current = -1;
          requestRender();
        }
        canvas.style.cursor = 'default';
      }

      if (!posRef.current.isDragging) return;
      const diffX = e.clientX - posRef.current.dragStartX;
      const deltaIndex = diffX / 55;
      const state = stateRef.current;
      const total = state.filteredAlbums?.length || 1;
      const newTarget = Math.max(0, Math.min(total - 1, posRef.current.dragStartTarget + deltaIndex));
      posRef.current.target = newTarget;
      requestRender();
    };

    const onPointerUp = () => {
      posRef.current.lastInteractionTime = performance.now();
      if (cardDragRef.current.isDragging) {
        cardDragRef.current.isDragging = false;
        cardDragRef.current.wasDrag = cardDragRef.current.dragDistance > 6;
      }

      if (posRef.current.isDragging) {
        posRef.current.isDragging = false;
        posRef.current.target = Math.round(posRef.current.target);
        setSelectedIndex(Math.round(posRef.current.target));
        playFlipSound();
      }
      requestRender();
    };

    const onWheel = (e) => {
      e.preventDefault();
      posRef.current.lastInteractionTime = performance.now();

      const rect = canvas.getBoundingClientRect();
      mouseVector.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseVector.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      raycaster.setFromCamera(mouseVector, camera);

      // Check if mouse is over the tracklist card
      const cardHits = raycaster.intersectObject(trackCardMesh, false);
      if (cardHits.length > 0 && cardHits[0].uv) {
        const trks = stateRef.current.playingAlbumTracks || [];
        const totalTracks = trks.length;
        const viewportHeight = 874;
        const rowHeight = 56;
        const maxScroll = Math.max(0, totalTracks * rowHeight - viewportHeight);

        if (maxScroll > 0) {
          cardScrollTarget.current = Math.max(0, Math.min(maxScroll, cardScrollTarget.current + e.deltaY * 0.9));
          requestRender();
        }
        return;
      }

      // Otherwise wheel navigates albums in the acrylic crate
      const step = e.deltaY > 0 ? 1 : -1;
      const state = stateRef.current;
      const total = state.filteredAlbums?.length || 1;
      const newTarget = Math.max(0, Math.min(total - 1, posRef.current.target + step));
      if (newTarget !== posRef.current.target) {
        posRef.current.target = newTarget;
        setSelectedIndex(newTarget);
        playFlipSound();
      }
      requestRender();
    };

    const raycaster = new THREE.Raycaster();
    const mouseVector = new THREE.Vector2();

    const onClick = (e) => {
      posRef.current.lastInteractionTime = performance.now();
      requestRender();
      // If pointer was dragged on the card, suppress click
      if (cardDragRef.current.wasDrag) {
        cardDragRef.current.wasDrag = false;
        return;
      }

      const rect = canvas.getBoundingClientRect();
      mouseVector.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseVector.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      raycaster.setFromCamera(mouseVector, camera);

      // 1. Check if clicking Turntable Start/Stop lever or Platter
      const ttHits = raycaster.intersectObjects([platter, vinylRecord, leverBase, jewelKnob], true);
      if (ttHits.length > 0) {
        handleTogglePlay();
        return;
      }

      // 2. Check if clicking Hero Easel
      const heroHits = raycaster.intersectObject(heroSleeve, false);
      if (heroHits.length > 0) {
        if (stateRef.current.playingAlbumId) {
          handleTogglePlay();
        } else {
          handlePlayAlbum();
        }
        return;
      }

      // 3. Check if clicking Unified Tracklist Card
      const cardHits = raycaster.intersectObject(trackCardMesh, false);
      if (cardHits.length > 0) {
        const hit = cardHits[0];
        if (hit.uv) {
          const uvX = hit.uv.x;
          const uvY = hit.uv.y;
          const canvasX = uvX * 1024;
          const canvasY = (1 - uvY) * 1100;

          const viewportTop = 236;
          const viewportBottom = 1110;
          const rowHeight = 56;
          const trks = stateRef.current.playingAlbumTracks || [];

          if (canvasY >= viewportTop && canvasY <= viewportBottom) {
            const currentScroll = cardScrollCurrent.current;
            const relativeY = canvasY - viewportTop + currentScroll;
            const clickedIdx = Math.floor(relativeY / rowHeight);

            if (clickedIdx >= 0 && clickedIdx < trks.length) {
              handlePlayTrack(clickedIdx);
              return;
            }
          } else if (canvasY < viewportTop) {
            // Clicking header toggles album play/pause
            handleTogglePlay();
            return;
          }
        }
        return;
      }

      // 5. Check if clicking a record in the crate
      const visibleMeshes = sleevePool.filter((s) => s.mesh.visible && s.frontMat.opacity > 0.35).map((s) => s.mesh);
      const intersects = raycaster.intersectObjects(visibleMeshes, false);

      if (intersects.length > 0) {
        const hitMesh = intersects[0].object;
        const hitItem = sleevePool.find((s) => s.mesh === hitMesh);
        if (hitItem && hitItem.albumIndex >= 0) {
          const state = stateRef.current;
          if (hitItem.albumIndex === state.selectedIndex) {
            handlePlayAlbum();
          } else {
            goToIndex(hitItem.albumIndex);
          }
        }
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('click', onClick);

    const onResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth || window.innerWidth;
      const h = mountRef.current.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
      renderer.setSize(w, h);

      const newScale = calculateCardScale(h);
      if (Math.abs(newScale - cardScale) > 0.05) {
        cardScale = newScale;
        trackCardCanvas.width = Math.round(1024 * cardScale);
        trackCardCanvas.height = Math.round(1100 * cardScale);
        lastRenderedPlayingAlbumId = null;
      }

      shadowNeedsUpdate = true;
      requestRender();
    };
    window.addEventListener('resize', onResize);

    return () => {
      isLoopRunning = false;
      cancelAnimationFrame(animationFrameId);
      requestRenderRef.current = null;
      applyThemeRef.current = null;

      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('click', onClick);

      scene.traverse((obj) => {
        if (obj.geometry) {
          obj.geometry.dispose();
        }
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });

      textureCache.forEach((tex) => tex.dispose());
      textureCache.clear();
      if (currentBgTex) currentBgTex.dispose();
      trackCardTex.dispose();

      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryId]);

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');
  const handleAZClick = (letter) => {
    let target = 0;
    if (letter === '#') {
      target = filteredAlbums.findIndex((a) => a.title && /^[0-9\W]/.test(a.title));
    } else {
      target = filteredAlbums.findIndex((a) => a.title && a.title.trim().toUpperCase().startsWith(letter));
    }
    if (target >= 0) {
      goToIndex(target);
    }
  };

  return (
    <div className={clsx(style.container, { [style.darkMode]: isDark })} ref={containerRef}>
      <div className={style.canvasWrap} ref={mountRef} />

      {/* Top Floating Bar: Minimalist with clear right side for Library switcher */}
      <div className={style.topBar}>
        <div className={style.topBarLeft}>
          <button className={style.exitButton} onClick={handleExit} title="Exit 3D View (Esc)">
            <Icon icon="GridIcon" size={16} stroke />
            <span>Grid View</span>
          </button>
          <button
            type="button"
            className={clsx(style.downloadButton, { [style.activeDownloading]: isDownloading })}
            onClick={handleOpenDownload}
            title={isDownloading ? 'Download in progress — click to view' : 'Download Album to Library (D)'}
          >
            <Icon icon="DownloadIcon" size={16} stroke />
            <span>{isDownloading ? downloadProgress?.percent || 'Downloading…' : 'Download'}</span>
          </button>
          <button
            type="button"
            className={style.themeToggleBtn}
            onClick={handleToggleTheme}
            title={isDark ? 'Switch to Sunlit Conservatory (T)' : 'Switch to Midnight Lounge (T)'}
          >
            {isDark ? (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
            <span>{isDark ? 'Day' : 'Night'}</span>
          </button>
          <span className={style.crateTitleBadge}>{filteredAlbums.length} Records</span>
        </div>

        {/* Frutiger Aero Glass Search Pill */}
        <div className={style.searchWrap}>
          <Icon icon="SearchIcon" size={15} stroke />
          <input
            type="text"
            placeholder="Search records..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedIndex(0);
            }}
          />
          {searchQuery && (
            <button className={style.clearBtn} onClick={() => setSearchQuery('')}>
              ×
            </button>
          )}
        </div>

        {/* Clear right area to never collide with library / profile selectors */}
        <div className={style.topBarRight} />
      </div>

      {/* Streamlined Bottom-Left Dock: Now Spinning Player Bar Only (Upper card removed) */}
      <div className={style.bottomLeftDock}>
        <div className={style.playerDock}>
          <div
            className={style.nowSpinningSection}
            onClick={handleTogglePlay}
            title="Click to toggle playback"
            style={{ cursor: 'pointer' }}
          >
            <div className={clsx(style.spinningDisc, { [style.active]: playerPlaying })} />
            <div className={style.spinningInfo}>
              <span className={style.label}>{playerPlaying ? 'Now Spinning' : 'Turntable Ready'}</span>
              <span className={style.title}>
                {currentTrack
                  ? currentTrack.title || 'Unknown Title'
                  : currentPlayingAlbum
                    ? currentPlayingAlbum.title
                    : 'Ready to Spin'}
              </span>
              <span className={style.artist}>
                {currentTrack
                  ? currentTrack.artist || 'Unknown Artist'
                  : currentPlayingAlbum
                    ? currentPlayingAlbum.artist
                    : 'Chromatix Vinyl'}
              </span>
            </div>
          </div>

          <div className={style.mediaControls}>
            <button className={style.mediaBtn} onClick={handlePrevTrack} title="Previous Track">
              <Icon icon="TrackSkipPrevIcon" size={14} stroke />
            </button>
            <button
              className={clsx(style.mediaBtn, style.mediaPlayBtn)}
              onClick={handleTogglePlay}
              title={playerPlaying ? 'Pause' : 'Play'}
            >
              <Icon icon={playerPlaying ? 'PauseFilledIcon' : 'PlayFilledIcon'} size={16} />
            </button>
            <button className={style.mediaBtn} onClick={handleNextTrack} title="Next Track">
              <Icon icon="TrackSkipNextIcon" size={14} stroke />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Center Scrubber & A-Z bar */}
      <div className={style.bottomBar}>
        <div className={style.scrubberCard}>
          <button className={style.stepBtn} onClick={() => goToIndex(selectedIndex - 1)} title="Previous Record (←)">
            <Icon icon="TrackSkipPrevIcon" size={13} stroke />
          </button>

          <div className={style.sliderWrap}>
            <input
              type="range"
              min={0}
              max={Math.max(0, filteredAlbums.length - 1)}
              value={selectedIndex}
              onChange={(e) => goToIndex(parseInt(e.target.value, 10))}
              className={style.slider}
            />
            <span className={style.counter}>
              {selectedIndex + 1} / {filteredAlbums.length}
            </span>
          </div>

          <button className={style.stepBtn} onClick={() => goToIndex(selectedIndex + 1)} title="Next Record (→)">
            <Icon icon="TrackSkipNextIcon" size={13} stroke />
          </button>
        </div>

        <div className={style.azBar}>
          {alphabet.map((letter) => (
            <button
              key={letter}
              className={clsx(style.azBtn, {
                [style.active]: currentAlbum?.title?.trim().toUpperCase().startsWith(letter),
              })}
              onClick={() => handleAZClick(letter)}
            >
              {letter}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RecordBin3D;
