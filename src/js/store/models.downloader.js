// ======================================================================
// IMPORTS
// ======================================================================

import { toast } from 'sonner';
import * as bridge from 'js/services/bridge';

// ======================================================================
// STATE
// ======================================================================

const state = {
  isDownloading: false,
  url: '',
  progress: null, // { percent, status, title, speed, eta, trackIndex, totalTracks }
  completeResult: null, // { album, artist, trackCount, folder }
  error: null,
};

// ======================================================================
// REDUCERS
// ======================================================================

const reducers = {
  setDownloaderState(rootState, payload) {
    return { ...rootState, ...payload };
  },
  resetDownloader(rootState) {
    return {
      ...rootState,
      isDownloading: false,
      url: '',
      progress: null,
      completeResult: null,
      error: null,
    };
  },
};

// ======================================================================
// EFFECTS
// ======================================================================

const effects = (dispatch) => ({
  startDownload(payload, rootState) {
    const { url, outputBase = 'D:/Music', format = 'mp3' } = payload || {};
    if (!url || !url.trim()) return;

    if (!window?.ipcRenderer) {
      dispatch.downloaderModel.setDownloaderState({
        error: 'Desktop runtime not detected. Please run Chromatix via Electron desktop.',
        isDownloading: false,
      });
      return;
    }

    dispatch.downloaderModel.setDownloaderState({
      url: url.trim(),
      isDownloading: true,
      error: null,
      completeResult: null,
      progress: {
        percent: '0%',
        status: 'starting',
        title: 'Connecting to source...',
      },
    });

    window.ipcRenderer.send('download-music-start', {
      url: url.trim(),
      outputBase,
      format,
    });
  },

  cancelDownload(payload, rootState) {
    if (window?.ipcRenderer) {
      window.ipcRenderer.send('download-music-cancel');
    }
    dispatch.downloaderModel.setDownloaderState({
      isDownloading: false,
      progress: null,
    });
    toast.info('Download cancelled');
  },

  handleProgress(progressData) {
    dispatch.downloaderModel.setDownloaderState({
      progress: progressData,
    });
  },

  handleComplete(result, rootState) {
    dispatch.downloaderModel.setDownloaderState({
      isDownloading: false,
      completeResult: result,
      progress: null,
    });

    toast.success(
      `Downloaded ${result?.album || 'Album'} by ${result?.artist || 'Artist'} (${result?.trackCount || 0} tracks)!`
    );

    // Auto-refresh library in Plex/Jellyfin if logged in
    const currentLibrary = rootState?.sessionModel?.currentLibrary;
    if (currentLibrary?.libraryId && bridge.refreshLibrary) {
      bridge.refreshLibrary(currentLibrary.libraryId);
    }
  },

  handleError(errorData) {
    dispatch.downloaderModel.setDownloaderState({
      isDownloading: false,
      error: errorData?.error || 'Download failed',
    });
    toast.error(errorData?.error || 'Download failed');
  },
});

// ======================================================================
// EXPORT
// ======================================================================

export const downloaderModel = {
  state,
  reducers,
  effects,
};
