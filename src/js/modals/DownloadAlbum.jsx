// ======================================================================
// IMPORTS
// ======================================================================

import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';

import { Button, Icon, ModalWindow } from 'js/components';
import * as bridge from 'js/services/bridge';
import modalStyle from './modals.module.scss';
import style from './DownloadAlbum.module.scss';

// ======================================================================
// COMPONENT
// ======================================================================

const DownloadAlbum = () => {
  const dispatch = useDispatch();
  const currentLibrary = useSelector(({ sessionModel }) => sessionModel.currentLibrary);
  const currentService = useSelector(({ appModel }) => appModel.currentService);
  const currentModalData = useSelector(({ dialogModel }) => dialogModel.currentModalData);

  const {
    isDownloading,
    url: savedUrl,
    progress,
    completeResult,
    error,
  } = useSelector(({ downloaderModel }) => downloaderModel || {});

  const [inputUrl, setInputUrl] = useState(savedUrl || currentModalData?.url || '');

  const handleStart = () => {
    if (!inputUrl.trim()) return;
    dispatch.downloaderModel.startDownload({
      url: inputUrl.trim(),
      outputBase: 'D:/Music',
      format: 'mp3',
    });
  };

  const handleCancel = () => {
    dispatch.downloaderModel.cancelDownload();
  };

  const handleMinimize = () => {
    dispatch.dialogModel.closeModal();
    if (isDownloading) {
      toast.info('Download active in background — monitor progress in sidebar');
    }
  };

  const handleOpenFolder = (folderPath) => {
    if (window?.ipcRenderer) {
      window.ipcRenderer.send('open-folder', folderPath || 'D:/Music');
    }
  };

  const handleRefreshLibrary = () => {
    if (currentLibrary?.libraryId && bridge.refreshLibrary) {
      bridge.refreshLibrary(currentLibrary.libraryId);
      toast.info('Triggered library scan on ' + (currentService || 'Plex'));
    } else {
      toast.info('Scan triggered');
    }
  };

  const parsePercent = (pStr) => {
    if (!pStr) return 0;
    const match = pStr.match(/([\d.]+)%/);
    return match ? parseFloat(match[1]) : 0;
  };

  const percentNumber = progress?.percent ? parsePercent(progress.percent) : 0;

  return (
    <ModalWindow variant="collection">
      <div className={style.modalHeaderRow}>
        <Dialog.Title asChild>
          <h1 className={modalStyle.title}>Download Album to Library</h1>
        </Dialog.Title>
        <div className={style.headerActions}>
          <button type="button" className={style.headerIconBtn} title="Minimize to sidebar" onClick={handleMinimize}>
            <Icon icon="CollapseIcon" cover stroke />
          </button>
          <button type="button" className={style.headerIconBtn} title="Close" onClick={handleMinimize}>
            <Icon icon="CrossSmallIcon" cover stroke />
          </button>
        </div>
      </div>

      <Dialog.Description asChild>
        <div className={style.downloadWrap}>
          <div className={style.pathBadge}>
            <span>Destination:</span>
            <span className={style.pathText}>D:/Music/&lt;Album&gt;-&lt;artist&gt;</span>
            <button type="button" className={style.openFolderBtn} onClick={() => handleOpenFolder('D:/Music')}>
              Open D:/Music
            </button>
          </div>

          <div className={style.inputGroup}>
            <label className={style.label} htmlFor="music-download-url">
              Album / Playlist Link (YouTube, YT Music, SoundCloud)
            </label>
            <input
              id="music-download-url"
              className={style.urlInput}
              type="text"
              placeholder="Paste album URL here (e.g. https://music.youtube.com/playlist?list=...)"
              value={inputUrl}
              autoFocus
              disabled={isDownloading}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isDownloading) handleStart();
              }}
            />
            {currentModalData?.defaultQuery && !inputUrl && (
              <span className={style.suggestedQuery}>
                Target Album: <strong>{currentModalData.defaultQuery}</strong>
              </span>
            )}
          </div>

          <div>
            <span className={style.tagBadge}>✓ Full ID3 Tags (Track #, Artist, Album, Date)</span>{' '}
            <span className={style.tagBadge}>✓ Cover Art Embedded</span>{' '}
            <span className={style.tagBadge}>✓ High Quality MP3</span>
          </div>

          {progress && (
            <div className={style.progressCard}>
              <div className={style.progressHeader}>
                <span className={style.progressTitle}>{progress.title || 'Downloading...'}</span>
                <span className={style.progressPercent}>{progress.percent || '0%'}</span>
              </div>

              <div className={style.progressBarTrack}>
                <div className={style.progressBarFill} style={{ width: `${percentNumber}%` }} />
              </div>

              <div className={style.progressMeta}>
                <span>
                  {progress.trackIndex && progress.totalTracks
                    ? `Track ${progress.trackIndex} of ${progress.totalTracks}`
                    : progress.status === 'tagging'
                      ? 'Finalizing ID3 tags...'
                      : 'Downloading...'}
                </span>
                <span>
                  {progress.speed ? `${progress.speed}` : ''}
                  {progress.eta ? ` • ETA: ${progress.eta}` : ''}
                </span>
              </div>
            </div>
          )}

          {completeResult && (
            <div className={style.successBox}>
              <strong>Download Complete!</strong>
              <span>
                Saved {completeResult.trackCount || 0} track(s) to <code>{completeResult.folder}</code> with full ID3
                tags.
              </span>
              <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                <Button size="small" color="secondary" onClick={() => handleOpenFolder(completeResult.folder)}>
                  Open Album Folder
                </Button>
                {currentLibrary?.libraryId && (
                  <Button size="small" color="mono" onClick={handleRefreshLibrary}>
                    Scan in Plex
                  </Button>
                )}
              </div>
            </div>
          )}

          {error && <div className={style.errorBox}>{error}</div>}
        </div>
      </Dialog.Description>

      <div className={modalStyle.buttons}>
        {!isDownloading ? (
          <>
            <Button onClick={handleStart} size="small" color="mono" disabled={!inputUrl.trim()}>
              Start Download
            </Button>
            <Button onClick={handleMinimize} size="small" color="tertiary">
              Close
            </Button>
          </>
        ) : (
          <>
            <Button onClick={handleMinimize} size="small" color="secondary">
              Minimize to Sidebar
            </Button>
            <Button onClick={handleCancel} size="small" color="tertiary">
              Cancel Download
            </Button>
          </>
        )}
      </div>
    </ModalWindow>
  );
};

// ======================================================================
// EXPORT
// ======================================================================

export default DownloadAlbum;
