// ======================================================================
// IMPORTS
// ======================================================================

import { useDispatch, useSelector } from 'react-redux';
import { Icon } from 'js/components';
import style from './SideBarDownloadProgress.module.scss';

// ======================================================================
// COMPONENT
// ======================================================================

export const SideBarDownloadProgress = () => {
  const dispatch = useDispatch();
  const { isDownloading, progress, completeResult, error } = useSelector(
    ({ downloaderModel }) => downloaderModel || {}
  );

  const parsePercent = (pStr) => {
    if (!pStr) return 0;
    const match = pStr.match(/([\d.]+)%/);
    return match ? parseFloat(match[1]) : 0;
  };

  const handleOpenModal = () => {
    dispatch.dialogModel.showModal('DownloadAlbum');
  };

  const handleCancel = (e) => {
    e.stopPropagation();
    dispatch.downloaderModel.cancelDownload();
  };

  const handleOpenFolder = (e) => {
    e.stopPropagation();
    if (window?.ipcRenderer) {
      window.ipcRenderer.send('open-folder', completeResult?.folder || 'D:/Music');
    }
  };

  const handleDismiss = (e) => {
    e.stopPropagation();
    dispatch.downloaderModel.resetDownloader();
  };

  // Completed State
  if (completeResult && !isDownloading) {
    return (
      <div className={`${style.widget} ${style.completeCard}`} onClick={handleOpenModal}>
        <div className={style.completeHeader}>
          <span>✓ Download Complete</span>
        </div>
        <div className={style.completeTitle}>
          {completeResult.album || 'Album'}
          {completeResult.artist ? ` - ${completeResult.artist}` : ''}
        </div>
        <div className={style.actions}>
          <button type="button" className={style.folderBtn} onClick={handleOpenFolder} title="Open folder in Explorer">
            <span style={{ width: 14, height: 14, display: 'inline-flex' }}>
              <Icon icon="FolderIcon" cover stroke />
            </span>
            Open Folder
          </button>
          <button type="button" className={style.dismissBtn} onClick={handleDismiss} title="Dismiss">
            <span style={{ width: 14, height: 14, display: 'inline-flex' }}>
              <Icon icon="CrossSmallIcon" cover stroke />
            </span>
          </button>
        </div>
      </div>
    );
  }

  // Error State
  if (error && !isDownloading) {
    return (
      <div
        className={style.widget}
        style={{ borderColor: 'rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.08)' }}
        onClick={handleOpenModal}
      >
        <div className={style.header}>
          <span style={{ color: '#ef4444', fontWeight: 600, fontSize: 11 }}>⚠ Download Failed</span>
          <button type="button" className={style.dismissBtn} onClick={handleDismiss} title="Dismiss">
            <span style={{ width: 14, height: 14, display: 'inline-flex' }}>
              <Icon icon="CrossSmallIcon" cover stroke />
            </span>
          </button>
        </div>
        <div className={style.title} style={{ color: '#fca5a5' }}>
          {error}
        </div>
        <button type="button" className={style.expandBtn} onClick={handleOpenModal}>
          View Details
        </button>
      </div>
    );
  }

  // Active Downloading State
  if (isDownloading || progress) {
    const percentNum = parsePercent(progress?.percent);

    return (
      <div className={style.widget} onClick={handleOpenModal} style={{ cursor: 'pointer' }}>
        <div className={style.header}>
          <div className={style.statusGroup}>
            <span className={style.pulseDot} />
            <span className={style.statusLabel}>{progress?.status === 'tagging' ? 'Tagging...' : 'Downloading'}</span>
          </div>
          <span className={style.percentText}>{progress?.percent || '0%'}</span>
        </div>

        <div className={style.title} title={progress?.title || 'Downloading tracks...'}>
          {progress?.title || 'Connecting to source...'}
        </div>

        <div className={style.progressTrack}>
          <div className={style.progressFill} style={{ width: `${percentNum}%` }} />
        </div>

        <div className={style.metaRow}>
          <span>
            {progress?.trackIndex && progress?.totalTracks
              ? `Track ${progress.trackIndex}/${progress.totalTracks}`
              : progress?.status === 'tagging'
                ? 'Finalizing ID3'
                : 'Fetching metadata'}
          </span>
          <span>
            {progress?.speed ? progress.speed : ''}
            {progress?.eta ? ` • ${progress.eta}` : ''}
          </span>
        </div>

        <div className={style.actions}>
          <button type="button" className={style.expandBtn} onClick={handleOpenModal} title="Maximize download window">
            <span style={{ width: 13, height: 13, display: 'inline-flex' }}>
              <Icon icon="DownloadIcon" cover stroke />
            </span>
            Expand Window
          </button>
          <button type="button" className={style.cancelBtn} onClick={handleCancel} title="Cancel download">
            <span style={{ width: 14, height: 14, display: 'inline-flex' }}>
              <Icon icon="CrossSmallIcon" cover stroke />
            </span>
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default SideBarDownloadProgress;
