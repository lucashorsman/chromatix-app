// ======================================================================
// IMPORTS
// ======================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';
import * as THREE from 'three';
import clsx from 'clsx';

import { Icon } from 'js/components';
import { durationToStringMed, formatReleaseYear } from 'js/utils';
import * as bridge from 'js/services/bridge';

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

function renderBookletCanvas(canvas, album, tracks, activeTrackId, isPlaying) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // Background: Fine textured cream paper with subtle glass sheen
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#f9fcfa');
  grad.addColorStop(0.5, '#f0f6f3');
  grad.addColorStop(1, '#e6efe9');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Subtle border
  ctx.strokeStyle = 'rgba(0, 140, 100, 0.25)';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, w - 8, h - 8);

  // Center gatefold spine shadow
  const spineGrad = ctx.createLinearGradient(w / 2 - 30, 0, w / 2 + 30, 0);
  spineGrad.addColorStop(0, 'rgba(0, 30, 20, 0)');
  spineGrad.addColorStop(0.5, 'rgba(0, 30, 20, 0.18)');
  spineGrad.addColorStop(1, 'rgba(0, 30, 20, 0)');
  ctx.fillStyle = spineGrad;
  ctx.fillRect(w / 2 - 30, 0, 60, h);

  // -------------------------------------------------------------
  // LEFT PAGE: ALBUM CREDITS & EDITORIAL NOTES
  // -------------------------------------------------------------
  ctx.save();
  ctx.fillStyle = '#008763';
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.fillText(isPlaying ? '● NOW PLAYING' : 'TURNTABLE READY', 50, 75);

  ctx.fillStyle = '#0b2921';
  ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
  const title = album?.title || 'No Album Selected';
  const truncTitle = title.length > 22 ? title.slice(0, 22) + '…' : title;
  ctx.fillText(truncTitle, 50, 130);

  ctx.fillStyle = '#008763';
  ctx.font = '600 26px system-ui, -apple-system, sans-serif';
  const artist = album?.artist || 'Unknown Artist';
  const truncArtist = artist.length > 26 ? artist.slice(0, 26) + '…' : artist;
  ctx.fillText(truncArtist, 50, 175);

  // Divider
  ctx.strokeStyle = 'rgba(0, 140, 100, 0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(50, 205);
  ctx.lineTo(460, 205);
  ctx.stroke();

  ctx.fillStyle = '#496d63';
  ctx.font = '500 20px system-ui, -apple-system, sans-serif';
  const yearStr = album?.releaseDate ? formatReleaseYear(album.releaseDate) : 'Vinyl Edition';
  const tracksStr = tracks?.length ? `${tracks.length} tracks` : `${album?.totalTracks || 0} tracks`;
  const durStr = album?.duration ? durationToStringMed(album.duration) : '';
  ctx.fillText(`${yearStr} • ${tracksStr} ${durStr ? '• ' + durStr : ''}`, 50, 245);

  ctx.fillStyle = '#5a786f';
  ctx.font = '18px system-ui, -apple-system, sans-serif';
  ctx.fillText('Chromatix Conservatory Hi-Fi Audio Suite', 50, 310);
  ctx.fillText('Mastered for High-Fidelity 33⅓ RPM Playback', 50, 340);
  ctx.fillText('Natural Glasshouse Acoustic Dispersion', 50, 370);

  // Decorative seal / badge
  ctx.strokeStyle = '#00b686';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(100, 440, 32, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#008763';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CHROMATIX', 100, 436);
  ctx.fillText('VINYL', 100, 452);
  ctx.textAlign = 'left';
  ctx.restore();

  // -------------------------------------------------------------
  // RIGHT PAGE: INTERACTIVE TRACKLIST
  // -------------------------------------------------------------
  ctx.save();
  ctx.fillStyle = '#008763';
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.fillText('TRACKLIST • CLICK TO PLAY', 550, 75);

  const displayTracks = (tracks || []).slice(0, 8);
  const rowHeight = 44;
  const startY = 105;

  if (displayTracks.length === 0) {
    ctx.fillStyle = '#5a786f';
    ctx.font = 'italic 20px system-ui, sans-serif';
    ctx.fillText('Loading track details...', 550, 160);
  } else {
    displayTracks.forEach((trk, idx) => {
      const y = startY + idx * rowHeight;
      const isTrkActive = activeTrackId && trk.trackId === activeTrackId;

      if (isTrkActive) {
        // Highlight active track pill
        ctx.fillStyle = 'rgba(0, 182, 134, 0.22)';
        ctx.fillRect(540, y - 26, 440, 36);
        ctx.strokeStyle = '#00b686';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(540, y - 26, 440, 36);
      }

      // Track Number
      ctx.fillStyle = isTrkActive ? '#008763' : '#496d63';
      ctx.font = isTrkActive ? 'bold 20px system-ui, sans-serif' : '600 18px system-ui, sans-serif';
      ctx.fillText(String(idx + 1).padStart(2, '0'), 550, y);

      // Track Title
      ctx.fillStyle = isTrkActive ? '#005b42' : '#0b2921';
      ctx.font = isTrkActive ? 'bold 20px system-ui, sans-serif' : '500 19px system-ui, sans-serif';
      const rawTitle = trk.title || `Track ${idx + 1}`;
      const songTitle = rawTitle.length > 24 ? rawTitle.slice(0, 24) + '…' : rawTitle;
      ctx.fillText(songTitle, 595, y);

      // Duration
      ctx.fillStyle = '#5a786f';
      ctx.font = '500 17px system-ui, sans-serif';
      ctx.textAlign = 'right';
      const dur = trk.duration ? durationToStringMed(trk.duration) : '';
      ctx.fillText(dur, 970, y);
      ctx.textAlign = 'left';
    });
  }
  ctx.restore();
}

function renderCratePlaqueCanvas(canvas, album) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // Frosted acrylic plaque with soft emerald backlight
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  grad.addColorStop(1, 'rgba(230, 248, 242, 0.9)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(0, 182, 134, 0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, w - 4, h - 4);

  ctx.fillStyle = '#008763';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText('CRATE SELECTION • PRESS ENTER TO SPIN', 24, 32);

  ctx.fillStyle = '#0b2921';
  ctx.font = 'bold 26px system-ui, sans-serif';
  const title = album?.title || 'Select Record';
  const truncTitle = title.length > 30 ? title.slice(0, 30) + '…' : title;
  ctx.fillText(truncTitle, 24, 70);

  ctx.fillStyle = '#008763';
  ctx.font = '600 20px system-ui, sans-serif';
  const artist = album?.artist || 'Unknown Artist';
  const truncArtist = artist.length > 34 ? artist.slice(0, 34) + '…' : artist;
  ctx.fillText(truncArtist, 24, 102);
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
  const playingAlbumId = useSelector(({ sessionModel }) => sessionModel.playingAlbumId);
  const playingTrackList = useSelector(({ sessionModel }) => sessionModel.playingTrackList);
  const playingTrackIndex = useSelector(({ sessionModel }) => sessionModel.playingTrackIndex);
  const playingTrackKeys = useSelector(({ sessionModel }) => sessionModel.playingTrackKeys);
  const currentLibrary = useSelector(({ sessionModel }) => sessionModel.currentLibrary);
  const libraryId = currentLibrary?.libraryId;

  const allAlbumTracks = useSelector(({ appModel }) => appModel.allAlbumTracks);
  const currentTrack = playingTrackList?.[playingTrackKeys[playingTrackIndex]];

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

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
    if (currentPlayingAlbum && libraryId) {
      bridge.getAlbumTracks(libraryId, currentPlayingAlbum.albumId);
    }
  }, [currentPlayingAlbum, libraryId]);

  const playingAlbumTracks =
    (currentPlayingAlbum && allAlbumTracks?.[libraryId + '-' + currentPlayingAlbum.albumId]) || [];

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
  });

  const stateRef = useRef({});
  stateRef.current = {
    filteredAlbums,
    selectedIndex,
    playerPlaying,
    playingAlbumId,
    currentAlbum,
    currentPlayingAlbum,
    playingAlbumTracks,
    currentTrack,
  };

  const goToIndex = useCallback((index) => {
    const total = stateRef.current.filteredAlbums?.length || 1;
    const clamped = Math.max(0, Math.min(total - 1, index));
    setSelectedIndex((prev) => {
      if (clamped !== prev) {
        posRef.current.target = clamped;
        playFlipSound();
        return clamped;
      }
      return prev;
    });
  }, []);

  const handlePlayAlbum = useCallback(() => {
    const alb = stateRef.current.currentAlbum;
    if (!alb) return;
    if (stateRef.current.playingAlbumId === alb.albumId && stateRef.current.playerPlaying) {
      dispatch.playerModel.playerPause();
    } else if (stateRef.current.playingAlbumId === alb.albumId && !stateRef.current.playerPlaying) {
      dispatch.playerModel.playerResume();
    } else {
      dispatch.playerModel.playerLoadAlbum({ albumId: alb.albumId });
    }
  }, [dispatch]);

  const handlePlayTrack = useCallback(
    (trackIndex) => {
      const alb = stateRef.current.currentPlayingAlbum || stateRef.current.currentAlbum;
      if (!alb) return;
      dispatch.playerModel.playerLoadAlbum({ albumId: alb.albumId, trackIndex });
    },
    [dispatch]
  );

  const handleTogglePlay = useCallback(() => {
    if (stateRef.current.playerPlaying) {
      dispatch.playerModel.playerPause();
    } else {
      dispatch.playerModel.playerResume();
    }
  }, [dispatch]);

  const handleNextTrack = useCallback(() => {
    dispatch.playerModel.playerNextTrack();
  }, [dispatch]);

  const handlePrevTrack = useCallback(() => {
    dispatch.playerModel.playerPrevTrack();
  }, [dispatch]);

  const handleExit = useCallback(() => {
    if (onExit) onExit();
    else dispatch.sessionModel.setSessionState({ viewAlbums: 'grid' });
  }, [onExit, dispatch]);

  // Robust global keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
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
      } else if (e.key === 'Escape') {
        handleExit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToIndex, handleTogglePlay, handlePlayAlbum, handleExit]);

  // ======================================================================
  // THREE.JS GLASSHOUSE FOREST CONSERVATORY SCENE
  // Centered Record Player + Slight 3/4 Perspective + Gatefold Liner Notes
  // ======================================================================
  useEffect(() => {
    if (!mountRef.current) return;

    let animationFrameId;
    const width = mountRef.current.clientWidth || window.innerWidth;
    const height = mountRef.current.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xd0e8df, 0.007);

    // SLIGHT 3/4 ANGLE PERSPECTIVE:
    // Centered turntable at (0, 0, 3.5).
    // Camera slightly offset (+3.8 units to the right) giving a slight, natural 3/4 hi-fi listening station perspective!
    const camera = new THREE.PerspectiveCamera(34, width / height, 0.5, 1000);
    camera.position.set(3.8, 19.2, 36.0);
    camera.lookAt(0, 5.2, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

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
      });
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      textureCache.set(targetUrl, tex);
      return tex;
    };

    // Load High-Res Forest Conservatory Panorama
    const bgTex = textureLoader.load('/images/conservatory-bg.jpg', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.mapping = THREE.EquirectangularReflectionMapping;
      scene.background = tex;
    });

    // Curved Panorama Cylinder in background for continuous physical depth
    const backdropGeo = new THREE.CylinderGeometry(85, 85, 55, 48, 1, true, -Math.PI * 0.75, Math.PI * 1.5);
    const backdropMat = new THREE.MeshBasicMaterial({
      map: bgTex,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const backdropMesh = new THREE.Mesh(backdropGeo, backdropMat);
    backdropMesh.position.set(0, 15, -12);
    scene.add(backdropMesh);

    // Natural Conservatory Sunlighting
    const ambientLight = new THREE.AmbientLight(0xdcf3ea, 1.25);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfffaec, 2.2);
    sunLight.position.set(28, 48, 25);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 130;
    sunLight.shadow.camera.left = -32;
    sunLight.shadow.camera.right = 32;
    sunLight.shadow.camera.top = 32;
    sunLight.shadow.camera.bottom = -32;
    sunLight.shadow.bias = -0.0004;
    scene.add(sunLight);

    const forestFillLight = new THREE.DirectionalLight(0x9ef0df, 0.9);
    forestFillLight.position.set(-28, 24, 15);
    scene.add(forestFillLight);

    const rimLight = new THREE.DirectionalLight(0xd0f5ff, 0.7);
    rimLight.position.set(0, 30, -28);
    scene.add(rimLight);

    // Floating Polished White Carrara Marble Console with Frosted Cyan Trim
    const consoleMat = new THREE.MeshPhysicalMaterial({
      color: 0xf5fbf9,
      roughness: 0.1,
      metalness: 0.03,
      clearcoat: 0.85,
      clearcoatRoughness: 0.08,
    });
    const consoleMesh = new THREE.Mesh(new THREE.BoxGeometry(118, 2.2, 56), consoleMat);
    consoleMesh.position.set(0, -1.1, 0);
    consoleMesh.receiveShadow = true;
    scene.add(consoleMesh);

    const glassTrimMat = new THREE.MeshPhysicalMaterial({
      color: 0x4ee1be,
      transmission: 0.85,
      roughness: 0.15,
      ior: 1.5,
      thickness: 0.8,
      transparent: true,
      opacity: 0.85,
    });
    const glassTrim = new THREE.Mesh(new THREE.BoxGeometry(118.4, 0.35, 56.4), glassTrimMat);
    glassTrim.position.set(0, -0.05, 0);
    scene.add(glassTrim);

    // Frutiger Aero Crystal Acrylic Materials
    const acrylicMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 0.94,
      roughness: 0.05,
      ior: 1.52,
      thickness: 1.2,
      transparent: true,
      opacity: 0.92,
      specularIntensity: 1.0,
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

    // Frosted acrylic plinth with chrome edge
    const ttBaseMat = new THREE.MeshPhysicalMaterial({
      color: 0xddf8f2,
      transmission: 0.9,
      roughness: 0.08,
      ior: 1.5,
      thickness: 1.5,
      transparent: true,
      opacity: 0.92,
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

    const topPlateMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.85 });
    const topPlate = new THREE.Mesh(new THREE.BoxGeometry(17.2, 0.08, 14.8), topPlateMat);
    topPlate.position.set(0, 2.05, 0);
    turntableGroup.add(topPlate);

    const platterMat = new THREE.MeshStandardMaterial({ color: 0x334440, roughness: 0.3, metalness: 0.8 });
    const platter = new THREE.Mesh(new THREE.CylinderGeometry(6.0, 6.0, 0.35, 48), platterMat);
    platter.position.set(-1.6, 2.35, 0);
    platter.castShadow = true;
    turntableGroup.add(platter);

    const vinylRecord = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 5.8, 0.05, 48), vinylMat);
    vinylRecord.position.set(-1.6, 2.55, 0);
    vinylRecord.castShadow = true;
    turntableGroup.add(vinylRecord);

    const centerLabelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.0 });
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

    const jewelMat = new THREE.MeshPhysicalMaterial({
      color: 0x00e6a8,
      roughness: 0.1,
      transmission: 0.5,
      thickness: 0.5,
      emissive: 0x004d38,
      emissiveIntensity: 0.5,
    });
    const jewelKnob = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), jewelMat);
    jewelKnob.position.set(0, 1.35, 0);
    leverPivot.add(jewelKnob);

    turntableGroup.add(leverPivot);

    // Tone arm
    const armPivotGroup = new THREE.Group();
    armPivotGroup.position.set(5.6, 2.3, -4.2);

    const armBase = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 1.1, 24), chromeMat);
    armBase.position.set(0, 0.55, 0);
    armBase.castShadow = true;
    armPivotGroup.add(armBase);

    const armTube = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 8.2, 16), chromeMat);
    armTube.position.set(-2.2, 1.3, 2.2);
    armTube.rotation.x = Math.PI / 2;
    armTube.rotation.z = -0.55;
    armTube.castShadow = true;
    armPivotGroup.add(armTube);

    const cartridgeMat = new THREE.MeshStandardMaterial({ color: 0x00b686, roughness: 0.3, metalness: 0.4 });
    const cartridge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 1.1), cartridgeMat);
    cartridge.position.set(-4.3, 1.2, 5.3);
    cartridge.rotation.y = -0.3;
    cartridge.castShadow = true;
    armPivotGroup.add(cartridge);

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

    const heroVinyl = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 5.8, 0.04, 48), vinylMat);
    heroVinyl.rotation.x = Math.PI / 2;
    heroVinyl.position.set(1.2, 2.2, -0.05);
    heroSleeve.add(heroVinyl);

    const heroLabelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.0 });
    const heroLabel = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.05, 32), heroLabelMat);
    heroLabel.rotation.x = Math.PI / 2;
    heroLabel.position.set(1.2, 2.2, -0.03);
    heroSleeve.add(heroLabel);

    scene.add(easelGroup);

    // ==================================================================
    // 3. LEFT WING: ACRYLIC RECORD CRATE (BROWSING BIN) + FRONT PLAQUE
    // ==================================================================
    const crateGroup = new THREE.Group();
    crateGroup.position.set(-16.8, 0, 1.5);

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

    // Dynamic Procedural Canvas Plaque on Crate Front
    const cratePlaqueCanvas = document.createElement('canvas');
    cratePlaqueCanvas.width = 512;
    cratePlaqueCanvas.height = 128;
    renderCratePlaqueCanvas(cratePlaqueCanvas, currentAlbum);

    const cratePlaqueTex = new THREE.CanvasTexture(cratePlaqueCanvas);
    cratePlaqueTex.colorSpace = THREE.SRGBColorSpace;
    const cratePlaqueMat = new THREE.MeshBasicMaterial({ map: cratePlaqueTex, transparent: true });

    const cratePlaqueMesh = new THREE.Mesh(new THREE.PlaneGeometry(14.8, 3.7), cratePlaqueMat);
    cratePlaqueMesh.position.set(0, 2.0, 14.42);
    crateGroup.add(cratePlaqueMesh);

    scene.add(crateGroup);

    // ==================================================================
    // 4. RIGHT WING: GATEFOLD LINER NOTES BOOKLET (TRACKLIST OPTION B)
    // ==================================================================
    const bookletGroup = new THREE.Group();
    bookletGroup.position.set(16.8, 0.25, 2.2);
    bookletGroup.rotation.x = -0.22; // Tilted up for comfortable reading angle
    bookletGroup.rotation.y = -0.16; // Tilted slightly towards the centered turntable

    const bookletCanvas = document.createElement('canvas');
    bookletCanvas.width = 1024;
    bookletCanvas.height = 512;
    renderBookletCanvas(bookletCanvas, currentPlayingAlbum, playingAlbumTracks, currentTrack?.trackId, playerPlaying);

    const bookletTex = new THREE.CanvasTexture(bookletCanvas);
    bookletTex.colorSpace = THREE.SRGBColorSpace;

    const bookletMat = new THREE.MeshStandardMaterial({
      map: bookletTex,
      roughness: 0.35,
      metalness: 0.05,
    });
    const bookletSpineMat = new THREE.MeshStandardMaterial({ color: 0x008763, roughness: 0.6 });

    const bookletMesh = new THREE.Mesh(new THREE.BoxGeometry(20.0, 10.0, 0.16), [
      bookletSpineMat,
      bookletSpineMat,
      bookletSpineMat,
      bookletSpineMat,
      bookletMat,
      bookletMat,
    ]);
    bookletMesh.position.set(0, 5.0, 0);
    bookletMesh.castShadow = true;
    bookletMesh.receiveShadow = true;
    bookletGroup.add(bookletMesh);

    scene.add(bookletGroup);

    // ==================================================================
    // 5. SLEEVES POOL (Cascading in Left Wing Acrylic Rack)
    // ==================================================================
    const MAX_VISIBLE_SLEEVES = 24;
    const rackSleeveGeo = new THREE.BoxGeometry(11.8, 11.8, 0.16);
    const sleevePool = [];
    const defaultSpineMat = new THREE.MeshStandardMaterial({ color: 0x223530, roughness: 0.8 });

    for (let i = 0; i < MAX_VISIBLE_SLEEVES; i++) {
      const frontMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.02 });
      const backMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.02 });
      const materials = [defaultSpineMat, defaultSpineMat, defaultSpineMat, defaultSpineMat, frontMat, backMat];
      const sleeveMesh = new THREE.Mesh(rackSleeveGeo, materials);
      sleeveMesh.castShadow = true;
      sleeveMesh.receiveShadow = true;
      sleeveMesh.visible = false;
      crateGroup.add(sleeveMesh);

      sleevePool.push({ mesh: sleeveMesh, frontMat, backMat, albumIndex: -1 });
    }

    let continuousPos = posRef.current.target;
    let targetArmRotation = 0.05;
    let currentArmRotation = 0.05;

    // Track previous rendered data to avoid unnecessary canvas repainting
    let lastRenderedAlbumId = null;
    let lastRenderedPlayingAlbumId = null;
    let lastRenderedTrackId = null;
    let lastRenderedPlayingState = null;
    let lastRenderedTracksCount = 0;

    // Continuous Animation Loop
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const state = stateRef.current;
      const filtered = state.filteredAlbums || [];
      const totalAlbums = filtered.length;

      const diff = posRef.current.target - continuousPos;
      if (Math.abs(diff) > 0.001) {
        continuousPos += diff * 0.18;
      } else {
        continuousPos = posRef.current.target;
      }

      // Turntable animation & physical lever
      if (state.playerPlaying) {
        platter.rotation.y -= 0.035;
        vinylRecord.rotation.y -= 0.035;
        centerLabel.rotation.y -= 0.035;
        heroVinyl.rotation.y -= 0.035;
        heroLabel.rotation.y -= 0.035;
        targetArmRotation = 0.36;
        heroVinyl.position.x = 3.4;
        heroLabel.position.x = 3.4;
        leverPivot.rotation.x = THREE.MathUtils.lerp(leverPivot.rotation.x, 0.35, 0.1);
        jewelMat.emissiveIntensity = 0.8;
      } else {
        targetArmRotation = 0.05;
        heroVinyl.position.x = 1.2;
        heroLabel.position.x = 1.2;
        leverPivot.rotation.x = THREE.MathUtils.lerp(leverPivot.rotation.x, 0, 0.1);
        jewelMat.emissiveIntensity = 0.3;
      }
      currentArmRotation += (targetArmRotation - currentArmRotation) * 0.08;
      armPivotGroup.rotation.y = currentArmRotation;

      // Update Crate Plaque Canvas when selected album changes
      const activeCrateAlb = filtered[state.selectedIndex] || filtered[0];
      if (activeCrateAlb && activeCrateAlb.albumId !== lastRenderedAlbumId) {
        lastRenderedAlbumId = activeCrateAlb.albumId;
        renderCratePlaqueCanvas(cratePlaqueCanvas, activeCrateAlb);
        cratePlaqueTex.needsUpdate = true;
      }

      // Update Gatefold Booklet Canvas when playing album or track changes
      const playingAlb = state.currentPlayingAlbum;
      const trks = state.playingAlbumTracks;
      const curTrk = state.currentTrack;
      const curTrkId = curTrk?.trackId;
      const isPlay = state.playerPlaying;

      if (
        playingAlb?.albumId !== lastRenderedPlayingAlbumId ||
        curTrkId !== lastRenderedTrackId ||
        isPlay !== lastRenderedPlayingState ||
        trks.length !== lastRenderedTracksCount
      ) {
        lastRenderedPlayingAlbumId = playingAlb?.albumId;
        lastRenderedTrackId = curTrkId;
        lastRenderedPlayingState = isPlay;
        lastRenderedTracksCount = trks.length;

        renderBookletCanvas(bookletCanvas, playingAlb, trks, curTrkId, isPlay);
        bookletTex.needsUpdate = true;
      }

      // The easel showcases the album currently playing!
      const currentPlayingAlbum = albums.find((a) => a.albumId === state.playingAlbumId) || playingAlb;
      const easelThumb = currentPlayingAlbum?.thumbMd || currentPlayingAlbum?.thumbSm;
      if (easelThumb) {
        const tex = getTexture(easelThumb);
        if (tex) {
          if (heroFrontMat.map !== tex) {
            heroFrontMat.map = tex;
            heroFrontMat.needsUpdate = true;
          }
          if (heroBackMat.map !== tex) {
            heroBackMat.map = tex;
            heroBackMat.needsUpdate = true;
          }
          if (heroLabelMat.map !== tex) {
            heroLabelMat.map = tex;
            heroLabelMat.needsUpdate = true;
          }
          if (centerLabelMat.map !== tex) {
            centerLabelMat.map = tex;
            centerLabelMat.needsUpdate = true;
          }
        }
      }

      if (totalAlbums === 0) {
        sleevePool.forEach((item) => (item.mesh.visible = false));
        renderer.render(scene, camera);
        return;
      }

      // Position Sleeves in the Acrylic Rack
      const centerIdx = Math.round(continuousPos);
      const halfWindow = Math.floor(MAX_VISIBLE_SLEEVES / 2);
      const startIdx = Math.max(0, centerIdx - halfWindow);
      const endIdx = Math.min(totalAlbums - 1, centerIdx + halfWindow);

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
        let targetRotX = 0;
        let targetY = 6.2;

        if (delta < -0.2) {
          const flipOffset = -delta;
          targetZ = 3.5 + Math.min(9.5, flipOffset * 0.45);
          targetY = 1.4;
          targetRotX = 0.88;
        } else if (delta > 0.2) {
          targetZ = -1.2 - delta * 0.45;
          targetY = 5.9;
          targetRotX = -0.18;
        } else {
          const flipFactor = (delta + 0.2) / 0.4;
          targetRotX = THREE.MathUtils.lerp(0.88, -0.18, flipFactor);
          targetZ = -delta * 1.8;
          const lift = Math.max(0, 1.0 - Math.abs(delta) * 4.0);
          targetY = 6.2 + lift * 1.2;
        }

        item.mesh.position.set(0, targetY, targetZ);
        item.mesh.rotation.x = targetRotX;
      }

      while (poolPtr < MAX_VISIBLE_SLEEVES) {
        sleevePool[poolPtr++].mesh.visible = false;
      }

      renderer.render(scene, camera);
    };

    animationFrameId = requestAnimationFrame(animate);

    const canvas = renderer.domElement;

    const onPointerDown = (e) => {
      posRef.current.isDragging = true;
      posRef.current.dragStartX = e.clientX;
      posRef.current.dragStartTarget = posRef.current.target;
    };

    const onPointerMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      // Slight 3/4 baseline parallax
      camera.position.x = 3.8 + nx * 2.2;
      camera.position.y = 19.2 + ny * 1.1;
      camera.lookAt(0, 5.2, 0);

      if (!posRef.current.isDragging) return;
      const diffX = e.clientX - posRef.current.dragStartX;
      const deltaIndex = diffX / 55;
      const state = stateRef.current;
      const total = state.filteredAlbums?.length || 1;
      const newTarget = Math.max(0, Math.min(total - 1, posRef.current.dragStartTarget + deltaIndex));
      posRef.current.target = newTarget;
    };

    const onPointerUp = () => {
      if (posRef.current.isDragging) {
        posRef.current.isDragging = false;
        posRef.current.target = Math.round(posRef.current.target);
        setSelectedIndex(Math.round(posRef.current.target));
        playFlipSound();
      }
    };

    const onWheel = (e) => {
      e.preventDefault();
      const step = e.deltaY > 0 ? 1 : -1;
      const state = stateRef.current;
      const total = state.filteredAlbums?.length || 1;
      const newTarget = Math.max(0, Math.min(total - 1, posRef.current.target + step));
      if (newTarget !== posRef.current.target) {
        posRef.current.target = newTarget;
        setSelectedIndex(newTarget);
        playFlipSound();
      }
    };

    const raycaster = new THREE.Raycaster();
    const mouseVector = new THREE.Vector2();

    const onClick = (e) => {
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

      // 3. Check if clicking Crate Plaque
      const plaqueHits = raycaster.intersectObject(cratePlaqueMesh, false);
      if (plaqueHits.length > 0) {
        handlePlayAlbum();
        return;
      }

      // 4. Check if clicking Gatefold Liner Notes Booklet (Tracklist Option B)
      const bookletHits = raycaster.intersectObject(bookletMesh, false);
      if (bookletHits.length > 0) {
        const hit = bookletHits[0];
        if (hit.uv) {
          const uvX = hit.uv.x;
          const uvY = hit.uv.y;

          // If clicking on the right page (Tracklist area: x >= 0.52)
          if (uvX >= 0.52) {
            // Tracklist rows run from canvas Y: 105 to 457 (uvY 0.79 down to 0.10)
            const canvasY = (1 - uvY) * 512;
            const startY = 105;
            const rowHeight = 44;
            const trks = stateRef.current.playingAlbumTracks || [];

            if (canvasY >= startY - 20 && canvasY <= startY + 8 * rowHeight) {
              const clickedIdx = Math.floor((canvasY - (startY - 20)) / rowHeight);
              if (clickedIdx >= 0 && clickedIdx < trks.length) {
                handlePlayTrack(clickedIdx);
                return;
              }
            }
          } else {
            // Clicking left page toggles album play/pause
            handleTogglePlay();
            return;
          }
        }
      }

      // 5. Check if clicking a record in the crate
      const visibleMeshes = sleevePool.filter((s) => s.mesh.visible).map((s) => s.mesh);
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
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('click', onClick);
      renderer.dispose();
      textureCache.forEach((tex) => tex.dispose());
      bgTex.dispose();
      cratePlaqueTex.dispose();
      bookletTex.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albums, handlePlayAlbum, handleTogglePlay, handlePlayTrack, goToIndex]);

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
    <div className={style.container} ref={containerRef}>
      <div className={style.canvasWrap} ref={mountRef} />

      {/* Top Floating Bar: Minimalist with clear right side for Library switcher */}
      <div className={style.topBar}>
        <div className={style.topBarLeft}>
          <button className={style.exitButton} onClick={handleExit} title="Exit 3D View (Esc)">
            <Icon icon="GridIcon" size={16} stroke />
            <span>Grid View</span>
          </button>
          <span className={style.crateTitleBadge}>{filteredAlbums.length} Records in Conservatory</span>
        </div>

        {/* Frutiger Aero Glass Search Pill */}
        <div className={style.searchWrap}>
          <Icon icon="SearchIcon" size={15} stroke />
          <input
            type="text"
            placeholder="Search conservatory bin..."
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
