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
  const [showTracklist, setShowTracklist] = useState(false);

  const filteredAlbums = useMemo(() => {
    if (!searchQuery.trim()) return albums;
    const q = searchQuery.toLowerCase();
    return albums.filter(
      (a) => (a.title && a.title.toLowerCase().includes(q)) || (a.artist && a.artist.toLowerCase().includes(q))
    );
  }, [albums, searchQuery]);

  const currentAlbum = filteredAlbums[selectedIndex] || filteredAlbums[0];
  const albumTracks = (currentAlbum && allAlbumTracks?.[libraryId + '-' + currentAlbum.albumId]) || [];

  useEffect(() => {
    if (showTracklist && currentAlbum && libraryId) {
      bridge.getAlbumTracks(libraryId, currentAlbum.albumId);
    }
  }, [showTracklist, currentAlbum, libraryId]);

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

  const handleShuffleAlbum = useCallback(() => {
    const alb = stateRef.current.currentAlbum;
    if (!alb) return;
    dispatch.playerModel.playerLoadAlbum({ albumId: alb.albumId, isShuffle: true });
  }, [dispatch]);

  const handlePlayTrack = useCallback(
    (trackIndex) => {
      const alb = stateRef.current.currentAlbum;
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
  // ======================================================================
  useEffect(() => {
    if (!mountRef.current) return;

    let animationFrameId;
    const width = mountRef.current.clientWidth || window.innerWidth;
    const height = mountRef.current.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xd0e8df, 0.007);

    // Camera angled to see:
    // Left: Dedicated Glass Display Easel (Hero Active Album, 100% unblocked)
    // Center: Transparent Acrylic Crate Rack with collection
    // Right: Frosted Acrylic & Chrome Turntable
    const camera = new THREE.PerspectiveCamera(34, width / height, 0.5, 1000);
    camera.position.set(0.5, 18, 38);
    camera.lookAt(0.5, 5.5, 0);

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
    sunLight.shadow.camera.left = -30;
    sunLight.shadow.camera.right = 30;
    sunLight.shadow.camera.top = 30;
    sunLight.shadow.camera.bottom = -30;
    sunLight.shadow.bias = -0.0004;
    scene.add(sunLight);

    const forestFillLight = new THREE.DirectionalLight(0x9ef0df, 0.9);
    forestFillLight.position.set(-28, 24, 15);
    scene.add(forestFillLight);

    const rimLight = new THREE.DirectionalLight(0xd0f5ff, 0.7);
    rimLight.position.set(0, 30, -28);
    scene.add(rimLight);

    // Floating Polished White Carrara Marble Console with Glass Edge Trim
    const consoleMat = new THREE.MeshPhysicalMaterial({
      color: 0xf5fbf9,
      roughness: 0.1,
      metalness: 0.03,
      clearcoat: 0.85,
      clearcoatRoughness: 0.08,
    });
    const consoleMesh = new THREE.Mesh(new THREE.BoxGeometry(112, 2.2, 56), consoleMat);
    consoleMesh.position.set(0, -1.1, 0);
    consoleMesh.receiveShadow = true;
    scene.add(consoleMesh);

    // Frosted Cyan Acrylic Trim
    const glassTrimMat = new THREE.MeshPhysicalMaterial({
      color: 0x4ee1be,
      transmission: 0.85,
      roughness: 0.15,
      ior: 1.5,
      thickness: 0.8,
      transparent: true,
      opacity: 0.85,
    });
    const glassTrim = new THREE.Mesh(new THREE.BoxGeometry(112.4, 0.35, 56.4), glassTrimMat);
    glassTrim.position.set(0, -0.05, 0);
    scene.add(glassTrim);

    // Frutiger Aero Crystal Acrylic Material for Easel & Rack
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
    // 1. HERO DISPLAY EASEL (Active Record Display: 100% UNBLOCKED ART)
    // ==================================================================
    const easelGroup = new THREE.Group();
    easelGroup.position.set(-8.8, 0, 4.0);

    // Crystal acrylic base footer
    const easelBase = new THREE.Mesh(new THREE.BoxGeometry(14.2, 0.6, 9.5), acrylicMat);
    easelBase.position.set(0, 0.3, 0);
    easelBase.castShadow = true;
    easelBase.receiveShadow = true;
    easelGroup.add(easelBase);

    // Two tilted acrylic uprights supporting the record
    const easelUprightLeft = new THREE.Mesh(new THREE.BoxGeometry(0.8, 14.0, 0.6), acrylicMat);
    easelUprightLeft.position.set(-4.5, 7.0, -1.0);
    easelUprightLeft.rotation.x = -0.14; // tilted back ~8 deg
    easelUprightLeft.castShadow = true;
    easelGroup.add(easelUprightLeft);

    const easelUprightRight = new THREE.Mesh(new THREE.BoxGeometry(0.8, 14.0, 0.6), acrylicMat);
    easelUprightRight.position.set(4.5, 7.0, -1.0);
    easelUprightRight.rotation.x = -0.14;
    easelUprightRight.castShadow = true;
    easelGroup.add(easelUprightRight);

    // Acrylic retaining shelf lip
    const easelLip = new THREE.Mesh(new THREE.BoxGeometry(14.0, 1.2, 0.8), acrylicMat);
    easelLip.position.set(0, 0.9, 3.6);
    easelLip.castShadow = true;
    easelGroup.add(easelLip);

    // Chrome accent badge on easel shelf
    const easelBadge = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.6, 0.1), chromeMat);
    easelBadge.position.set(0, 0.9, 4.05);
    easelBadge.castShadow = true;
    easelGroup.add(easelBadge);

    // The Hero Record Sleeve on the Easel (Large 12.4 x 12.4, completely unobstructed)
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
    heroSleeve.rotation.x = -0.14; // Angled back gently directly facing the viewer
    heroSleeve.castShadow = true;
    heroSleeve.receiveShadow = true;
    easelGroup.add(heroSleeve);

    // Vinyl disc peeking out of the hero sleeve
    const heroVinyl = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 5.8, 0.04, 48), vinylMat);
    heroVinyl.rotation.x = Math.PI / 2;
    heroVinyl.position.set(3.4, 2.2, -0.05);
    heroSleeve.add(heroVinyl);

    const heroLabelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.0 });
    const heroLabel = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.05, 32), heroLabelMat);
    heroLabel.rotation.x = Math.PI / 2;
    heroLabel.position.set(3.4, 2.2, -0.03);
    heroSleeve.add(heroLabel);

    scene.add(easelGroup);

    // ==================================================================
    // 2. TRANSPARENT ACRYLIC RECORD RACK (Adjacent Collection Bin)
    // ==================================================================
    const rackGroup = new THREE.Group();
    rackGroup.position.set(7.2, 0, 0);

    const rackBottom = new THREE.Mesh(new THREE.BoxGeometry(15.5, 0.5, 30), acrylicMat);
    rackBottom.position.set(0, 0.25, 0);
    rackBottom.receiveShadow = true;
    rackGroup.add(rackBottom);

    const rackLeftSide = new THREE.Mesh(new THREE.BoxGeometry(0.7, 8.5, 30), acrylicMat);
    rackLeftSide.position.set(-7.75, 4.5, 0);
    rackLeftSide.castShadow = true;
    rackLeftSide.receiveShadow = true;
    rackGroup.add(rackLeftSide);

    const rackRightSide = new THREE.Mesh(new THREE.BoxGeometry(0.7, 8.5, 30), acrylicMat);
    rackRightSide.position.set(7.75, 4.5, 0);
    rackRightSide.castShadow = true;
    rackRightSide.receiveShadow = true;
    rackGroup.add(rackRightSide);

    // Low front lip
    const rackFront = new THREE.Mesh(new THREE.BoxGeometry(16.2, 2.5, 0.7), acrylicMat);
    rackFront.position.set(0, 1.5, 15);
    rackFront.castShadow = true;
    rackFront.receiveShadow = true;
    rackGroup.add(rackFront);

    const rackBack = new THREE.Mesh(new THREE.BoxGeometry(16.2, 8.5, 0.7), acrylicMat);
    rackBack.position.set(0, 4.5, -15);
    rackBack.castShadow = true;
    rackBack.receiveShadow = true;
    rackGroup.add(rackBack);

    // Chrome support rails running down the rack
    const railLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 30, 16), chromeMat);
    railLeft.rotation.x = Math.PI / 2;
    railLeft.position.set(-6.8, 0.7, 0);
    rackGroup.add(railLeft);

    const railRight = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 30, 16), chromeMat);
    railRight.rotation.x = Math.PI / 2;
    railRight.position.set(6.8, 0.7, 0);
    rackGroup.add(railRight);

    scene.add(rackGroup);

    // ==================================================================
    // 3. MODERN ACRYLIC & CHROME TURNTABLE
    // ==================================================================
    const turntableGroup = new THREE.Group();
    turntableGroup.position.set(23.5, 0, 0);

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
    const ttBase = new THREE.Mesh(new THREE.BoxGeometry(17.5, 2.0, 15), ttBaseMat);
    ttBase.position.set(0, 1.0, 0);
    ttBase.castShadow = true;
    ttBase.receiveShadow = true;
    turntableGroup.add(ttBase);

    // Chrome isolation feet
    const footGeo = new THREE.CylinderGeometry(0.9, 0.7, 0.6, 24);
    [
      [-7.2, -5.8],
      [7.2, -5.8],
      [-7.2, 5.8],
      [7.2, 5.8],
    ].forEach(([fx, fz]) => {
      const foot = new THREE.Mesh(footGeo, chromeMat);
      foot.position.set(fx, 0.3, fz);
      turntableGroup.add(foot);
    });

    const topPlateMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.85 });
    const topPlate = new THREE.Mesh(new THREE.BoxGeometry(16.8, 0.08, 14.4), topPlateMat);
    topPlate.position.set(0, 2.05, 0);
    turntableGroup.add(topPlate);

    const platterMat = new THREE.MeshStandardMaterial({ color: 0x334440, roughness: 0.3, metalness: 0.8 });
    const platter = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 5.8, 0.35, 48), platterMat);
    platter.position.set(-1.6, 2.35, 0);
    platter.castShadow = true;
    turntableGroup.add(platter);

    const vinylRecord = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.6, 0.05, 48), vinylMat);
    vinylRecord.position.set(-1.6, 2.55, 0);
    vinylRecord.castShadow = true;
    turntableGroup.add(vinylRecord);

    const centerLabelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.0 });
    const centerLabel = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.06, 32), centerLabelMat);
    centerLabel.position.set(-1.6, 2.56, 0);
    turntableGroup.add(centerLabel);

    // Tone arm
    const armPivotGroup = new THREE.Group();
    armPivotGroup.position.set(5.5, 2.3, -4.2);

    const armBase = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 1.1, 24), chromeMat);
    armBase.position.set(0, 0.55, 0);
    armBase.castShadow = true;
    armPivotGroup.add(armBase);

    const armTube = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 8.0, 16), chromeMat);
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
    // 4. SLEEVES POOL (Cascading in Acrylic Rack)
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
      rackGroup.add(sleeveMesh);

      sleevePool.push({ mesh: sleeveMesh, frontMat, backMat, albumIndex: -1 });
    }

    let continuousPos = posRef.current.target;
    let targetArmRotation = 0.05;
    let currentArmRotation = 0.05;

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

      // Turntable animation & vinyl disc motion
      if (state.playerPlaying) {
        platter.rotation.y -= 0.035;
        vinylRecord.rotation.y -= 0.035;
        centerLabel.rotation.y -= 0.035;
        heroVinyl.rotation.y -= 0.035;
        heroLabel.rotation.y -= 0.035;
        targetArmRotation = 0.36;
        heroVinyl.position.x = 3.4;
        heroLabel.position.x = 3.4;
      } else {
        targetArmRotation = 0.05;
        heroVinyl.position.x = 1.2;
        heroLabel.position.x = 1.2;
      }
      currentArmRotation += (targetArmRotation - currentArmRotation) * 0.08;
      armPivotGroup.rotation.y = currentArmRotation;

      // The easel showcases the album currently playing! (falls back to selected if none playing yet)
      const currentPlayingAlbum = albums.find((a) => a.albumId === state.playingAlbumId);
      const easelAlbum = currentPlayingAlbum || filtered[state.selectedIndex] || filtered[0];
      const easelThumb = easelAlbum?.thumbMd || easelAlbum?.thumbSm;
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
        }
      }

      // Turntable center label texture (uses the same currently playing album)
      const playingThumb = currentPlayingAlbum?.thumbMd || currentPlayingAlbum?.thumbSm;
      if (playingThumb) {
        const tex = getTexture(playingThumb);
        if (tex && centerLabelMat.map !== tex) {
          centerLabelMat.map = tex;
          centerLabelMat.needsUpdate = true;
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

        // Arrangement in the transparent acrylic rack:
        // delta < 0: records flipped forward into front well (+Z), angled forward
        // delta === 0: active transition point
        // delta > 0: upright records stacked behind (-Z)
        const delta = idx - continuousPos;
        let targetZ = 0;
        let targetRotX = 0;
        let targetY = 6.2;

        if (delta < -0.2) {
          const flipOffset = -delta;
          targetZ = 3.5 + Math.min(10.0, flipOffset * 0.45);
          targetY = 1.4;
          targetRotX = 0.88; // Flipped forward resting in front well
        } else if (delta > 0.2) {
          targetZ = -1.2 - delta * 0.45;
          targetY = 5.9;
          targetRotX = -0.18; // Upright waiting in rear rack
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
      camera.position.x = 0.5 + nx * 2.5;
      camera.position.y = 18 + ny * 1.2;
      camera.lookAt(0.5, 5.5, 0);

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

      // Check if clicking Hero Easel (toggle playback of current playing album)
      const heroHits = raycaster.intersectObject(heroSleeve, false);
      if (heroHits.length > 0) {
        if (stateRef.current.playingAlbumId) {
          handleTogglePlay();
        } else {
          handlePlayAlbum();
        }
        return;
      }

      // Check if clicking a record in the rack
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
    };
  }, [albums, handlePlayAlbum, handleTogglePlay, goToIndex]);

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

      {/* Unified Bottom-Left Dock: Selected Album Card + Integrated Now Spinning Player Bar */}
      <div className={style.bottomLeftDock}>
        {/* Selected Record on Hero Display Easel */}
        {currentAlbum && (
          <div className={style.activeCard}>
            <div className={style.cardTop}>
              <img
                src={currentAlbum.thumbMd || currentAlbum.thumbSm || '/images/artwork-placeholder.png'}
                alt={currentAlbum.title}
                className={style.albumCoverMini}
              />
              <div className={style.meta}>
                <div className={style.albumTitle} title={currentAlbum.title}>
                  {currentAlbum.title}
                </div>
                <div
                  className={style.artistName}
                  onClick={() => {
                    if (currentAlbum.artistId) {
                      history.push(`/artists/${currentAlbum.artistId}`);
                    }
                  }}
                  title={currentAlbum.artist}
                >
                  {currentAlbum.artist}
                </div>
                <div className={style.subInfo}>
                  {currentAlbum.releaseDate && <span>{formatReleaseYear(currentAlbum.releaseDate)}</span>}
                  {currentAlbum.totalTracks && <span>• {currentAlbum.totalTracks} tracks</span>}
                  {currentAlbum.duration && <span>• {durationToStringMed(currentAlbum.duration)}</span>}
                </div>
              </div>
            </div>

            <div className={style.actionsRow}>
              <button className={style.playButton} onClick={handlePlayAlbum}>
                <Icon
                  icon={playingAlbumId === currentAlbum.albumId && playerPlaying ? 'PauseFilledIcon' : 'PlayFilledIcon'}
                  size={15}
                />
                <span>{playingAlbumId === currentAlbum.albumId && playerPlaying ? 'Pause' : 'Play Album'}</span>
              </button>

              <button className={style.iconBtn} onClick={handleShuffleAlbum} title="Shuffle Album">
                <Icon icon="ShuffleIcon" size={16} stroke />
              </button>

              <button
                className={clsx(style.iconBtn, { [style.active]: showTracklist })}
                onClick={() => setShowTracklist(!showTracklist)}
                title="Toggle Tracklist"
              >
                <Icon icon="ListIcon" size={16} stroke />
              </button>

              <button
                className={style.iconBtn}
                onClick={() => history.push(`/albums/${currentAlbum.albumId}`)}
                title="View Full Album Details"
              >
                <Icon icon="InfoIcon" size={16} stroke />
              </button>
            </div>
          </div>
        )}

        {/* Integrated Now Spinning & Media Controls Player Bar */}
        <div className={style.playerDock}>
          <div className={style.nowSpinningSection}>
            <div className={clsx(style.spinningDisc, { [style.active]: playerPlaying })} />
            <div className={style.spinningInfo}>
              <span className={style.label}>{playerPlaying ? 'Now Spinning' : 'Turntable Ready'}</span>
              <span className={style.title}>
                {currentTrack
                  ? currentTrack.title || 'Unknown Title'
                  : currentAlbum
                    ? currentAlbum.title
                    : 'Ready to Spin'}
              </span>
              <span className={style.artist}>
                {currentTrack
                  ? currentTrack.artist || 'Unknown Artist'
                  : currentAlbum
                    ? currentAlbum.artist
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

      {/* Slide-out Tracklist Drawer */}
      {showTracklist && currentAlbum && (
        <div className={style.tracklistDrawer}>
          <div className={style.drawerHeader}>
            <div className={style.titleWrap}>
              <h3>{currentAlbum.title}</h3>
              <p>{currentAlbum.artist}</p>
            </div>
            <button className={style.closeDrawerBtn} onClick={() => setShowTracklist(false)}>
              ×
            </button>
          </div>

          <div className={style.trackListScroll}>
            {albumTracks && albumTracks.length > 0 ? (
              albumTracks.map((trk, i) => (
                <div
                  key={trk.trackId || i}
                  className={clsx(style.trackRow, { [style.activeTrack]: currentTrack?.trackId === trk.trackId })}
                  onClick={() => handlePlayTrack(i)}
                >
                  <span className={style.trackNum}>{i + 1}</span>
                  <span className={style.trackTitle}>{trk.title}</span>
                  <span className={style.trackDuration}>{durationToStringMed(trk.duration)}</span>
                </div>
              ))
            ) : (
              <div className={style.emptyTracks}>Loading tracklist...</div>
            )}
          </div>
        </div>
      )}

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
