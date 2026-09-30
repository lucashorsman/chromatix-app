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
// AUDIO CUES & PROCEDURAL TEXTURES
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
    osc.frequency.setValueAtTime(140, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.05);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, audioCtx.currentTime);

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

function createProceduralWoodTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, '#28170e');
  grad.addColorStop(0.5, '#382114');
  grad.addColorStop(1, '#1e1008');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  ctx.fillStyle = 'rgba(15, 8, 4, 0.15)';
  for (let y = 0; y < 512; y += 3) {
    const wave = Math.sin(y * 0.04) * 6 + Math.cos(y * 0.015) * 10;
    ctx.fillRect(0, y + wave, 512, 1.4);
  }

  const radial = ctx.createRadialGradient(256, 256, 50, 256, 256, 360);
  radial.addColorStop(0, 'rgba(255, 220, 180, 0.06)');
  radial.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, 512, 512);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  return texture;
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

  // Robust global keyboard navigation for seamless arrow key navigation
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

  // Three.js Lifecycle
  useEffect(() => {
    if (!mountRef.current) return;

    let animationFrameId;
    const width = mountRef.current.clientWidth || window.innerWidth;
    const height = mountRef.current.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x100c0a, 0.012);

    // Optimized camera angle looking down into the crate so active record is 100% visible
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.5, 1000);
    camera.position.set(-2, 20, 35);
    camera.lookAt(-2, 5.0, 0);

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

    const ambientLight = new THREE.AmbientLight(0xffeedd, 0.95);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff4e2, 1.8);
    sunLight.position.set(30, 48, 28);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 130;
    sunLight.shadow.camera.left = -28;
    sunLight.shadow.camera.right = 28;
    sunLight.shadow.camera.top = 28;
    sunLight.shadow.camera.bottom = -28;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    const crateSpot = new THREE.SpotLight(0xffd5b0, 1.9, 65, Math.PI / 3.8, 0.45, 1.2);
    crateSpot.position.set(-7, 28, 16);
    crateSpot.target.position.set(-8, 5, 0);
    scene.add(crateSpot);

    const rimLight = new THREE.DirectionalLight(0x7fb2ff, 0.5);
    rimLight.position.set(-20, 20, -25);
    scene.add(rimLight);

    // Warm studio table
    const deskWoodTexture = createProceduralWoodTexture();
    const tableMat = new THREE.MeshStandardMaterial({
      map: deskWoodTexture,
      roughness: 0.38,
      metalness: 0.04,
    });
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(110, 2, 70), tableMat);
    tableTop.position.set(0, -1, 0);
    tableTop.receiveShadow = true;
    scene.add(tableTop);

    // Record Crate
    const crateGroup = new THREE.Group();
    crateGroup.position.set(-8.5, 0, 0);

    const crateWoodMat = new THREE.MeshStandardMaterial({
      color: 0x54351f,
      roughness: 0.72,
      metalness: 0.02,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xc9a458,
      roughness: 0.35,
      metalness: 0.8,
    });

    const crateBottom = new THREE.Mesh(new THREE.BoxGeometry(15.5, 0.6, 32), crateWoodMat);
    crateBottom.position.set(0, 0.3, 0);
    crateBottom.receiveShadow = true;
    crateGroup.add(crateBottom);

    const leftSide = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8.5, 32), crateWoodMat);
    leftSide.position.set(-7.75, 4.5, 0);
    leftSide.castShadow = true;
    leftSide.receiveShadow = true;
    crateGroup.add(leftSide);

    const rightSide = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8.5, 32), crateWoodMat);
    rightSide.position.set(7.75, 4.5, 0);
    rightSide.castShadow = true;
    rightSide.receiveShadow = true;
    crateGroup.add(rightSide);

    // Low front rim so active record cover art is never clipped
    const frontSide = new THREE.Mesh(new THREE.BoxGeometry(16.3, 3.2, 0.8), crateWoodMat);
    frontSide.position.set(0, 1.9, 16);
    frontSide.castShadow = true;
    frontSide.receiveShadow = true;
    crateGroup.add(frontSide);

    const backSide = new THREE.Mesh(new THREE.BoxGeometry(16.3, 8.5, 0.8), crateWoodMat);
    backSide.position.set(0, 4.5, -16);
    backSide.castShadow = true;
    backSide.receiveShadow = true;
    crateGroup.add(backSide);

    const namePlate = new THREE.Mesh(new THREE.BoxGeometry(6.5, 1.6, 0.1), brassMat);
    namePlate.position.set(0, 2.1, 16.45);
    namePlate.castShadow = true;
    crateGroup.add(namePlate);

    scene.add(crateGroup);

    // Turntable
    const turntableGroup = new THREE.Group();
    turntableGroup.position.set(18.5, 0, 0);

    const ttBaseMat = new THREE.MeshStandardMaterial({ color: 0x281912, roughness: 0.5, metalness: 0.15 });
    const ttBase = new THREE.Mesh(new THREE.BoxGeometry(19, 2.2, 16), ttBaseMat);
    ttBase.position.set(0, 1.1, 0);
    ttBase.castShadow = true;
    ttBase.receiveShadow = true;
    turntableGroup.add(ttBase);

    const topPlateMat = new THREE.MeshStandardMaterial({ color: 0x909090, roughness: 0.35, metalness: 0.7 });
    const topPlate = new THREE.Mesh(new THREE.BoxGeometry(18.2, 0.1, 15.2), topPlateMat);
    topPlate.position.set(0, 2.25, 0);
    topPlate.receiveShadow = true;
    turntableGroup.add(topPlate);

    const platterMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.6 });
    const platter = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.2, 0.4, 48), platterMat);
    platter.position.set(-1.5, 2.5, 0);
    platter.castShadow = true;
    turntableGroup.add(platter);

    const vinylMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.25, metalness: 0.4 });
    const vinylRecord = new THREE.Mesh(new THREE.CylinderGeometry(6.0, 6.0, 0.05, 48), vinylMat);
    vinylRecord.position.set(-1.5, 2.72, 0);
    vinylRecord.castShadow = true;
    turntableGroup.add(vinylRecord);

    const centerLabelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.0 });
    const centerLabel = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.06, 32), centerLabelMat);
    centerLabel.position.set(-1.5, 2.73, 0);
    turntableGroup.add(centerLabel);

    const armPivotGroup = new THREE.Group();
    armPivotGroup.position.set(6.2, 2.5, -4.5);

    const armBase = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 1.2, 24), topPlateMat);
    armBase.position.set(0, 0.6, 0);
    armBase.castShadow = true;
    armPivotGroup.add(armBase);

    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.15, metalness: 0.9 });
    const armTube = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 8.5, 16), chromeMat);
    armTube.position.set(-2.5, 1.4, 2.5);
    armTube.rotation.x = Math.PI / 2;
    armTube.rotation.z = -0.55;
    armTube.castShadow = true;
    armPivotGroup.add(armTube);

    const cartridge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 1.2), brassMat);
    cartridge.position.set(-4.8, 1.3, 5.8);
    cartridge.rotation.y = -0.3;
    cartridge.castShadow = true;
    armPivotGroup.add(cartridge);

    turntableGroup.add(armPivotGroup);
    scene.add(turntableGroup);

    // Sleeves Pool
    const MAX_VISIBLE_SLEEVES = 24;
    const sleeveGeometry = new THREE.BoxGeometry(12.2, 12.2, 0.16);
    const sleevePool = [];

    const defaultSpineMat = new THREE.MeshStandardMaterial({ color: 0x362c24, roughness: 0.85 });

    for (let i = 0; i < MAX_VISIBLE_SLEEVES; i++) {
      const frontMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.02 });
      const backMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.02 });
      const materials = [defaultSpineMat, defaultSpineMat, defaultSpineMat, defaultSpineMat, frontMat, backMat];
      const sleeveMesh = new THREE.Mesh(sleeveGeometry, materials);
      sleeveMesh.castShadow = true;
      sleeveMesh.receiveShadow = true;
      sleeveMesh.visible = false;
      crateGroup.add(sleeveMesh);

      const peekVinyl = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 0.04, 32), vinylMat);
      peekVinyl.rotation.x = Math.PI / 2;
      peekVinyl.visible = false;
      sleeveMesh.add(peekVinyl);

      sleevePool.push({ mesh: sleeveMesh, frontMat, backMat, peekVinyl, albumIndex: -1 });
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

      if (state.playerPlaying) {
        platter.rotation.y -= 0.035;
        vinylRecord.rotation.y -= 0.035;
        centerLabel.rotation.y -= 0.035;
        targetArmRotation = 0.38;
      } else {
        targetArmRotation = 0.05;
      }
      currentArmRotation += (targetArmRotation - currentArmRotation) * 0.08;
      armPivotGroup.rotation.y = currentArmRotation;

      const currentPlayingAlbum = albums.find((a) => a.albumId === state.playingAlbumId);
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

        // PHYSICAL BIN LAYOUT:
        // delta < 0: records already flipped forward into front well (+Z), lying flat down low so they NEVER obscure active album!
        // delta === 0: active record, stands tall and proud, 100% visible from top to bottom
        // delta > 0: unviewed records waiting behind (-Z), upright and stacked
        const delta = idx - continuousPos;
        let targetZ = 0;
        let targetRotX = 0;
        let targetY = 7.6;

        if (delta < -0.2) {
          // Flipped forward into front compartment: lay down low (Y=1.0) and pushed forward (Z=4.5..13)
          const flipOffset = -delta;
          targetZ = 4.0 + Math.min(10.5, flipOffset * 0.45);
          targetY = 1.2;
          targetRotX = 0.98; // ~56 deg forward, laying almost flat!
          item.peekVinyl.visible = false;
        } else if (delta > 0.2) {
          // Waiting behind in the crate: upright, tilted slightly back
          targetZ = -1.2 - delta * 0.45;
          targetY = 6.0;
          targetRotX = -0.20; // ~11 deg back
          item.peekVinyl.visible = false;
        } else {
          // Active Record Hero Zone (100% visible and unblocked)
          const flipFactor = (delta + 0.2) / 0.4;
          targetRotX = THREE.MathUtils.lerp(0.98, -0.20, flipFactor);
          targetZ = -delta * 1.8;
          const lift = Math.max(0, 1.0 - Math.abs(delta) * 4.0);
          targetY = 6.2 + lift * 1.6;

          if (lift > 0.35) {
            item.peekVinyl.visible = true;
            item.peekVinyl.position.set(2.5, 2.2, -0.1);
          } else {
            item.peekVinyl.visible = false;
          }
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
      camera.position.x = -2 + nx * 2.2;
      camera.position.y = 20 + ny * 1.2;
      camera.lookAt(-2, 5.0, 0);

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
      deskWoodTexture.dispose();
    };
  }, [albums]);

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
          <span className={style.crateTitleBadge}>{filteredAlbums.length} Records in Bin</span>
        </div>

        {/* Minimalist Search Pill */}
        <div className={style.searchWrap}>
          <Icon icon="SearchIcon" size={15} stroke />
          <input
            type="text"
            placeholder="Search record bin..."
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

        {/* Empty placeholder on top right to NEVER overlap user's library dropdown */}
        <div className={style.topBarRight} />
      </div>

      {/* Unified Bottom-Left Dock: Selected Album + Merged Now Spinning Media Controls */}
      <div className={style.bottomLeftDock}>
        {/* Selected Record in Crate */}
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
                {currentTrack ? currentTrack.title || 'Unknown Title' : currentAlbum ? currentAlbum.title : 'Ready to Spin'}
              </span>
              <span className={style.artist}>
                {currentTrack ? currentTrack.artist || 'Unknown Artist' : currentAlbum ? currentAlbum.artist : 'Chromatix Vinyl'}
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
