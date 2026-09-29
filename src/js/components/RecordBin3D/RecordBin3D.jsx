import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';
import * as THREE from 'three';
import clsx from 'clsx';

import { Icon } from 'js/components';
import { durationToStringMed, formatReleaseYear } from 'js/utils';
import * as bridge from 'js/services/bridge';

import style from './RecordBin3D.module.scss';

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

const getProxiedImageUrl = (url) => {
  if (!url) return null;
  if (typeof window !== 'undefined' && window.isElectron) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return '/api/proxy-image?url=' + encodeURIComponent(url);
  }
  return url;
};

export const RecordBin3D = ({ albums = [] }) => {
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
    current: selectedIndex,
    target: selectedIndex,
    isDragging: false,
    dragStartX: 0,
    dragStartTarget: 0,
  });

  useEffect(() => {
    posRef.current.target = selectedIndex;
  }, [selectedIndex]);

  const goToIndex = useCallback(
    (index) => {
      const clamped = Math.max(0, Math.min(filteredAlbums.length - 1, index));
      if (clamped !== selectedIndex) {
        setSelectedIndex(clamped);
        posRef.current.target = clamped;
        playFlipSound();
      }
    },
    [filteredAlbums.length, selectedIndex]
  );

  const handlePlayAlbum = useCallback(() => {
    if (!currentAlbum) return;
    if (playingAlbumId === currentAlbum.albumId && playerPlaying) {
      dispatch.playerModel.playerPause();
    } else if (playingAlbumId === currentAlbum.albumId && !playerPlaying) {
      dispatch.playerModel.playerResume();
    } else {
      dispatch.playerModel.playerLoadAlbum({ albumId: currentAlbum.albumId });
    }
  }, [currentAlbum, playingAlbumId, playerPlaying, dispatch]);

  const handleShuffleAlbum = useCallback(() => {
    if (!currentAlbum) return;
    dispatch.playerModel.playerLoadAlbum({ albumId: currentAlbum.albumId, isShuffle: true });
  }, [currentAlbum, dispatch]);

  const handlePlayTrack = useCallback(
    (trackIndex) => {
      if (!currentAlbum) return;
      dispatch.playerModel.playerLoadAlbum({ albumId: currentAlbum.albumId, trackIndex });
    },
    [currentAlbum, dispatch]
  );

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        goToIndex(selectedIndex + 1);
        e.preventDefault();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        goToIndex(selectedIndex - 1);
        e.preventDefault();
      } else if (e.key === ' ') {
        handlePlayAlbum();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, goToIndex, handlePlayAlbum]);

  useEffect(() => {
    if (!mountRef.current) return;

    let animationFrameId;
    const width = mountRef.current.clientWidth || 800;
    const height = mountRef.current.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x130f0d, 0.012);

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.5, 1000);
    camera.position.set(-1, 21, 30);
    camera.lookAt(-2, 5, 0);

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

    const ambientLight = new THREE.AmbientLight(0xffeedd, 0.85);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff2de, 1.9);
    sunLight.position.set(30, 45, 25);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 120;
    sunLight.shadow.camera.left = -25;
    sunLight.shadow.camera.right = 25;
    sunLight.shadow.camera.top = 25;
    sunLight.shadow.camera.bottom = -25;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    const crateSpot = new THREE.SpotLight(0xffd5b0, 1.8, 55, Math.PI / 4, 0.4, 1.2);
    crateSpot.position.set(-6, 26, 14);
    crateSpot.target.position.set(-8, 5, 0);
    scene.add(crateSpot);
    scene.add(crateSpot.target);

    const rimLight = new THREE.PointLight(0x7fb5ff, 0.5, 60);
    rimLight.position.set(-25, 12, -20);
    scene.add(rimLight);

    const deskWoodTexture = textureLoader.load('/vinyl/desk_texture.jpg', (tex) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(2, 2);
    });
    deskWoodTexture.colorSpace = THREE.SRGBColorSpace;

    const deskMat = new THREE.MeshStandardMaterial({
      color: 0x8a5b36,
      map: deskWoodTexture,
      roughness: 0.68,
      metalness: 0.04,
    });
    const desk = new THREE.Mesh(new THREE.BoxGeometry(120, 4, 80), deskMat);
    desk.position.set(0, -2.1, 0);
    desk.receiveShadow = true;
    scene.add(desk);

    const crateGroup = new THREE.Group();
    crateGroup.position.set(-7.5, 0, 0);

    const crateWoodMat = new THREE.MeshStandardMaterial({
      color: 0x5a3922,
      roughness: 0.72,
      metalness: 0.02,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xc9a458,
      roughness: 0.35,
      metalness: 0.8,
    });

    const crateBottom = new THREE.Mesh(new THREE.BoxGeometry(15.5, 0.6, 28), crateWoodMat);
    crateBottom.position.set(0, 0.3, 0);
    crateBottom.receiveShadow = true;
    crateGroup.add(crateBottom);

    const leftSide = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8.5, 28), crateWoodMat);
    leftSide.position.set(-7.75, 4.5, 0);
    leftSide.castShadow = true;
    leftSide.receiveShadow = true;
    crateGroup.add(leftSide);

    const rightSide = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8.5, 28), crateWoodMat);
    rightSide.position.set(7.75, 4.5, 0);
    rightSide.castShadow = true;
    rightSide.receiveShadow = true;
    crateGroup.add(rightSide);

    const frontSide = new THREE.Mesh(new THREE.BoxGeometry(16.3, 8.5, 0.8), crateWoodMat);
    frontSide.position.set(0, 4.5, 14);
    frontSide.castShadow = true;
    frontSide.receiveShadow = true;
    crateGroup.add(frontSide);

    const backSide = new THREE.Mesh(new THREE.BoxGeometry(16.3, 8.5, 0.8), crateWoodMat);
    backSide.position.set(0, 4.5, -14);
    backSide.castShadow = true;
    backSide.receiveShadow = true;
    crateGroup.add(backSide);

    const namePlate = new THREE.Mesh(new THREE.BoxGeometry(6.5, 1.8, 0.1), brassMat);
    namePlate.position.set(0, 4.5, 14.45);
    namePlate.castShadow = true;
    crateGroup.add(namePlate);

    scene.add(crateGroup);

    const turntableGroup = new THREE.Group();
    turntableGroup.position.set(17.5, 0, 0);

    const ttBaseMat = new THREE.MeshStandardMaterial({ color: 0x2e1e16, roughness: 0.5, metalness: 0.15 });
    const ttBase = new THREE.Mesh(new THREE.BoxGeometry(19, 2.2, 16), ttBaseMat);
    ttBase.position.set(0, 1.1, 0);
    ttBase.castShadow = true;
    ttBase.receiveShadow = true;
    turntableGroup.add(ttBase);

    const topPlateMat = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.35, metalness: 0.7 });
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

    const MAX_VISIBLE_SLEEVES = 24;
    const sleeveGeometry = new THREE.BoxGeometry(13.0, 13.0, 0.16);
    const sleevePool = [];

    const defaultSpineMat = new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.85 });

    for (let i = 0; i < MAX_VISIBLE_SLEEVES; i++) {
      const frontMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05 });
      const backMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.45, metalness: 0.05 });
      const materials = [defaultSpineMat, defaultSpineMat, defaultSpineMat, defaultSpineMat, frontMat, backMat];
      const sleeveMesh = new THREE.Mesh(sleeveGeometry, materials);
      sleeveMesh.castShadow = true;
      sleeveMesh.receiveShadow = true;
      sleeveMesh.visible = false;
      crateGroup.add(sleeveMesh);

      const peekVinyl = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 5.8, 0.04, 32), vinylMat);
      peekVinyl.rotation.x = Math.PI / 2;
      peekVinyl.visible = false;
      sleeveMesh.add(peekVinyl);

      sleevePool.push({ mesh: sleeveMesh, frontMat, backMat, peekVinyl, albumIndex: -1 });
    }

    let continuousPos = posRef.current.target;
    let targetArmRotation = 0.05;
    let currentArmRotation = 0.05;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const diff = posRef.current.target - continuousPos;
      if (Math.abs(diff) > 0.001) {
        continuousPos += diff * 0.16;
      } else {
        continuousPos = posRef.current.target;
      }

      const roundIdx = Math.round(continuousPos);
      if (roundIdx !== selectedIndex && !posRef.current.isDragging) {
        setSelectedIndex(roundIdx);
      }

      if (playerPlaying) {
        platter.rotation.y -= 0.035;
        vinylRecord.rotation.y -= 0.035;
        centerLabel.rotation.y -= 0.035;
        targetArmRotation = 0.38;
      } else {
        targetArmRotation = 0.05;
      }
      currentArmRotation += (targetArmRotation - currentArmRotation) * 0.08;
      armPivotGroup.rotation.y = currentArmRotation;

      const currentPlayingAlbum = albums.find((a) => a.albumId === playingAlbumId);
      const playingThumb = currentPlayingAlbum?.thumbMd || currentPlayingAlbum?.thumbSm;
      if (playingThumb) {
        const tex = getTexture(playingThumb);
        if (tex && centerLabelMat.map !== tex) {
          centerLabelMat.map = tex;
          centerLabelMat.needsUpdate = true;
        }
      }

      const totalAlbums = filteredAlbums.length;
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
        const album = filteredAlbums[idx];
        item.mesh.visible = true;
        item.albumIndex = idx;

        const thumbUrl = album.thumbMd || album.thumbSm;
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

        const delta = idx - continuousPos;
        let targetZ = 0;
        let targetRotX = 0;
        let targetY = 7.0;

        if (delta < -0.3) {
          targetRotX = -0.42;
          targetZ = delta * 0.55 - 1.5;
          targetY = 6.4;
          item.peekVinyl.visible = false;
        } else if (delta > 0.3) {
          targetRotX = 0.22;
          targetZ = delta * 0.55 + 1.2;
          targetY = 6.6;
          item.peekVinyl.visible = false;
        } else {
          const flipT = (delta + 0.3) / 0.6;
          targetRotX = THREE.MathUtils.lerp(-0.42, 0.22, flipT);
          targetZ = delta * 0.55;
          const liftFactor = Math.max(0, 1.0 - Math.abs(delta) * 2.2);
          targetY = 7.0 + liftFactor * 4.4;

          if (liftFactor > 0.3) {
            item.peekVinyl.visible = true;
            item.peekVinyl.position.set(2.4, 2.8, -0.1);
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
      camera.position.x = -1 + nx * 2.5;
      camera.position.y = 21 + ny * 1.5;
      camera.lookAt(-2, 5, 0);

      if (!posRef.current.isDragging) return;
      const diffX = e.clientX - posRef.current.dragStartX;
      const deltaIndex = -diffX / 50;
      const newTarget = Math.max(0, Math.min(filteredAlbums.length - 1, posRef.current.dragStartTarget + deltaIndex));
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
      const newTarget = Math.max(0, Math.min(filteredAlbums.length - 1, posRef.current.target + step));
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
          if (hitItem.albumIndex === selectedIndex) {
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
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
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
    };
  }, [filteredAlbums, selectedIndex, playerPlaying, playingAlbumId, albums, goToIndex, handlePlayAlbum]);

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

      <div className={style.topBar}>
        <div className={style.searchWrap}>
          <Icon icon="SearchIcon" className={style.searchIcon} stroke />
          <input
            type="text"
            placeholder="Search crate..."
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

        {currentTrack && (
          <div className={style.nowSpinningBadge}>
            <div className={clsx(style.spinningDisc, { [style.active]: playerPlaying })} />
            <div className={style.spinningInfo}>
              <span className={style.label}>Now Spinning</span>
              <span className={style.title}>{currentTrack.title || 'Unknown Title'}</span>
              <span className={style.artist}>{currentTrack.artist || 'Unknown Artist'}</span>
            </div>
            <button
              className={style.badgePlayBtn}
              onClick={() => {
                if (playerPlaying) dispatch.playerModel.playerPause();
                else dispatch.playerModel.playerResume();
              }}
              title={playerPlaying ? 'Pause' : 'Play'}
            >
              <Icon icon={playerPlaying ? 'PauseFilledIcon' : 'PlayFilledIcon'} cover />
            </button>
          </div>
        )}
      </div>

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
                cover
              />
              <span>{playingAlbumId === currentAlbum.albumId && playerPlaying ? 'Pause' : 'Play Album'}</span>
            </button>

            <button className={style.iconBtn} onClick={handleShuffleAlbum} title="Shuffle Album">
              <Icon icon="ShuffleIcon" cover stroke />
            </button>

            <button
              className={clsx(style.iconBtn, { [style.active]: showTracklist })}
              onClick={() => setShowTracklist(!showTracklist)}
              title="Toggle Tracklist"
            >
              <Icon icon="ListIcon" cover stroke />
            </button>

            <button
              className={style.iconBtn}
              onClick={() => history.push(`/albums/${currentAlbum.albumId}`)}
              title="View Full Album Details"
            >
              <Icon icon="InfoIcon" cover stroke />
            </button>
          </div>
        </div>
      )}

      {showTracklist && currentAlbum && (
        <div className={style.tracklistDrawer}>
          <div className={style.drawerHeader}>
            <h3>{currentAlbum.title} — Tracklist</h3>
            <button className={style.closeBtn} onClick={() => setShowTracklist(false)}>
              <Icon icon="CrossSmallIcon" cover stroke />
            </button>
          </div>

          <div className={style.tracksList}>
            {albumTracks.length === 0 ? (
              <div className={style.emptyTracks}>Loading tracks...</div>
            ) : (
              albumTracks.map((track, idx) => {
                const isThisPlaying =
                  playingAlbumId === currentAlbum.albumId && currentTrack?.trackId === track.trackId;

                return (
                  <div
                    key={track.trackId || idx}
                    className={clsx(style.trackRow, { [style.playing]: isThisPlaying })}
                    onClick={() => handlePlayTrack(idx)}
                  >
                    <div className={style.trackNumber}>
                      {isThisPlaying && playerPlaying ? '▶' : track.trackNumber || idx + 1}
                    </div>
                    <div className={style.trackDetails}>
                      <span className={style.trackName}>{track.title}</span>
                      {track.artist && track.artist !== currentAlbum.artist && (
                        <span className={style.trackArtist}>{track.artist}</span>
                      )}
                    </div>
                    <div className={style.trackDuration}>{durationToStringMed(track.duration)}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <div className={style.bottomNav}>
        <div className={style.navPill}>
          <button
            className={style.arrowBtn}
            onClick={() => goToIndex(selectedIndex - 1)}
            disabled={selectedIndex <= 0}
            title="Previous Album (Left Arrow)"
          >
            <Icon icon="ArrowLeftIcon" cover stroke />
          </button>

          <div className={style.sliderWrap}>
            <input
              type="range"
              min={0}
              max={Math.max(0, filteredAlbums.length - 1)}
              value={selectedIndex}
              onChange={(e) => goToIndex(parseInt(e.target.value, 10))}
            />
            <span className={style.counter}>
              {filteredAlbums.length > 0 ? `${selectedIndex + 1} / ${filteredAlbums.length}` : '0 / 0'}
            </span>
          </div>

          <button
            className={style.arrowBtn}
            onClick={() => goToIndex(selectedIndex + 1)}
            disabled={selectedIndex >= filteredAlbums.length - 1}
            title="Next Album (Right Arrow)"
          >
            <Icon icon="ArrowRightIcon" cover stroke />
          </button>
        </div>

        <div className={style.azPicker}>
          {alphabet.map((letter) => (
            <button key={letter} onClick={() => handleAZClick(letter)}>
              {letter}
            </button>
          ))}
        </div>
      </div>

      <div className={style.hintText}>Drag or Scroll to flip records</div>
    </div>
  );
};

export default RecordBin3D;
