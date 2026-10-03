const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const NodeID3 = require('node-id3');

// Find yt-dlp binary
function findYtDlp() {
  const possiblePaths = [
    'yt-dlp',
    'yt-dlp.exe',
    'C:\\Users\\lucas\\anaconda3\\Scripts\\yt-dlp.exe',
    'C:\\Users\\lucas\\AppData\\Local\\Programs\\Python\\Python313\\Scripts\\yt-dlp.exe',
  ];

  for (const p of possiblePaths) {
    if (p.includes('\\') && fs.existsSync(p)) {
      return p;
    }
  }
  return 'yt-dlp';
}

// Find ffmpeg directory
function findFfmpegDir() {
  const knownDirs = [
    'C:\\Users\\lucas\\.spotdl',
    'C:\\Users\\lucas\\anaconda3\\envs\\opencv-env\\Library\\bin',
    'C:\\Users\\lucas\\anaconda3\\Library\\bin',
    'C:\\Users\\lucas\\anaconda3\\pkgs\\ffmpeg-8.0.0-gpl_h70aa942_902\\Library\\bin',
    'C:\\Users\\lucas\\Documents\\GitHub\\Spotify-to-MP3-Downloader',
  ];

  for (const d of knownDirs) {
    if (fs.existsSync(path.join(d, 'ffmpeg.exe'))) {
      return d;
    }
  }

  const wingetPkgBase = 'C:\\Users\\lucas\\AppData\\Local\\Microsoft\\WinGet\\Packages';
  if (fs.existsSync(wingetPkgBase)) {
    try {
      const items = fs.readdirSync(wingetPkgBase);
      for (const item of items) {
        if (item.toLowerCase().includes('ffmpeg')) {
          const fullPath = path.join(wingetPkgBase, item);
          // Search recursively for bin folder containing ffmpeg.exe
          const candidate = findBinaryInDir(fullPath, 'ffmpeg.exe');
          if (candidate) {
            return path.dirname(candidate);
          }
        }
      }
    } catch (_e) {}
  }
  return null;
}

function findBinaryInDir(dir, binaryName) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findBinaryInDir(full, binaryName);
        if (found) return found;
      } else if (entry.name.toLowerCase() === binaryName.toLowerCase()) {
        return full;
      }
    }
  } catch (_e) {}
  return null;
}

let activeProcess = null;

function sanitizeFolderName(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\.+$/, '')
    .trim();
}

function cleanStderr(raw) {
  if (!raw) return '';
  const lines = raw
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('WARNING:'));

  const unique = Array.from(new Set(lines));
  return unique.slice(0, 4).join('\n').trim();
}

/**
 * Downloads an album or track and writes proper ID3 tags.
 * Output directory format: D:/Music/<Album>-<artist>/
 */
function startDownload({ url, outputBase = 'D:/Music', format = 'mp3', onProgress, onComplete, onError }) {
  if (activeProcess) {
    onError(new Error('A download is already in progress. Please wait or cancel it first.'));
    return;
  }

  const ytDlpPath = findYtDlp();
  const ffmpegDir = findFfmpegDir();

  // Normalize base path
  const baseDir = path.resolve(outputBase);
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  // Template to output into D:/Music/<Album>-<artist>/<track_number> - <title>.<ext>
  const outputTemplate = path.join(
    baseDir,
    '%(album,title)s-%(artist,creator,uploader)s',
    '%(playlist_index&{:02d} - |)s%(title)s.%(ext)s'
  );

  const args = [
    '--newline',
    '--no-warnings',
    '--windows-filenames',
    '-x',
    '--audio-format',
    format || 'mp3',
    '--audio-quality',
    '0',
    '--embed-metadata',
    '--embed-thumbnail',
    // ID3 Tagging mappings
    '--parse-metadata',
    'playlist_index:%(track_number)s',
    '--parse-metadata',
    '%(release_date>%Y,upload_date>%Y,date)s:%(meta_date)s',
    '-o',
    outputTemplate,
    '--progress-template',
    'CHX_PROG:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(info.title)s|%(info.playlist_index)s|%(info.n_entries)s|%(info.artist,info.creator,info.uploader)s|%(info.album,info.title)s|%(info.release_date>%Y,info.upload_date>%Y)s',
    url,
  ];

  if (ffmpegDir) {
    args.push('--ffmpeg-location', ffmpegDir);
  }

  console.log('[Downloader] Spawning yt-dlp:', ytDlpPath, args.join(' '));

  let detectedAlbum = '';
  let detectedArtist = '';
  let detectedDate = '';
  let downloadedFiles = [];
  let stderrBuffer = '';

  try {
    activeProcess = spawn(ytDlpPath, args, {
      windowsHide: true,
      env: {
        ...process.env,
        ...(ffmpegDir ? { PATH: `${ffmpegDir};${process.env.PATH}` } : {}),
      },
    });
  } catch (err) {
    activeProcess = null;
    onError(err);
    return;
  }

  activeProcess.stdout.on('data', (data) => {
    const lines = data.toString().split(/[\r\n]+/);
    for (const line of lines) {
      if (!line) continue;

      if (line.startsWith('CHX_PROG:')) {
        const parts = line.slice(9).split('|');
        const percent = parts[0]?.trim() || '';
        const speed = parts[1]?.trim() || '';
        const eta = parts[2]?.trim() || '';
        const title = parts[3]?.trim() || '';
        const playlistIndex = parts[4]?.trim() || '';
        const totalEntries = parts[5]?.trim() || '';
        const artist = parts[6]?.trim() || '';
        const album = parts[7]?.trim() || '';
        const date = parts[8]?.trim() || '';

        if (artist) detectedArtist = artist;
        if (album) detectedAlbum = album;
        if (date) detectedDate = date;

        onProgress({
          status: 'downloading',
          percent,
          speed,
          eta,
          title,
          trackIndex: playlistIndex,
          totalTracks: totalEntries,
          artist: detectedArtist,
          album: detectedAlbum,
        });
      } else if (
        line.includes('[ExtractAudio] Destination:') ||
        line.includes('[Merger] Merging formats into') ||
        line.includes('[download] Destination:')
      ) {
        const match = line.match(/(?:Destination:|into\s+)(.+)$/);
        if (match && match[1]) {
          const filePath = match[1].trim().replace(/^"/, '').replace(/"$/, '');
          downloadedFiles.push(filePath);
        }
      }
    }
  });

  activeProcess.stderr.on('data', (data) => {
    const text = data.toString();
    stderrBuffer += text;
  });

  activeProcess.on('close', async (code) => {
    activeProcess = null;

    // 1. Resolve the destination album directory
    let targetFolder = '';

    for (const f of downloadedFiles) {
      const dir = path.dirname(f);
      if (fs.existsSync(dir)) {
        targetFolder = dir;
        break;
      }
    }

    if (!targetFolder && detectedAlbum && detectedArtist) {
      const folderName = `${sanitizeFolderName(detectedAlbum)}-${sanitizeFolderName(detectedArtist)}`;
      const candidate = path.join(baseDir, folderName);
      if (fs.existsSync(candidate)) {
        targetFolder = candidate;
      }
    }

    if (!targetFolder && fs.existsSync(baseDir)) {
      const dirs = fs
        .readdirSync(baseDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => ({
          name: d.name,
          full: path.join(baseDir, d.name),
          mtime: fs.statSync(path.join(baseDir, d.name)).mtimeMs,
        }))
        .sort((a, b) => b.mtime - a.mtime);

      if (dirs.length > 0) {
        targetFolder = dirs[0].full;
      }
    }

    let mp3Files = [];
    if (targetFolder && fs.existsSync(targetFolder)) {
      mp3Files = fs.readdirSync(targetFolder).filter((f) => f.toLowerCase().endsWith('.mp3'));
    }

    // 2. Fail only if process had a non-zero exit code AND zero mp3 files were saved
    if (code !== 0 && mp3Files.length === 0 && downloadedFiles.length === 0) {
      onError(new Error(cleanStderr(stderrBuffer) || `Download process exited with code ${code}`));
      return;
    }

    onProgress({
      status: 'tagging',
      percent: '100%',
      title: 'Verifying ID3 tags and finalizing album...',
    });

    try {
      let taggedCount = 0;
      if (targetFolder && fs.existsSync(targetFolder)) {
        const coverPath = path.join(targetFolder, 'cover.jpg');
        const ffmpegBin = ffmpegDir ? path.join(ffmpegDir, 'ffmpeg.exe') : 'ffmpeg.exe';
        let squareCoverPath = null;

        // 3. Find cover image from folder or extract embedded image from first MP3
        let srcImg = null;
        const imageFiles = fs
          .readdirSync(targetFolder)
          .filter((f) => /\.(jpe?g|png|webp)$/i.test(f) && f.toLowerCase() !== 'cover.jpg');

        if (imageFiles.length > 0) {
          srcImg = path.join(targetFolder, imageFiles[0]);
        } else if (mp3Files.length > 0) {
          try {
            const firstMp3Path = path.join(targetFolder, mp3Files[0]);
            const existingTags = NodeID3.read(firstMp3Path);
            if (existingTags?.image?.imageBuffer) {
              const rawCoverPath = path.join(targetFolder, '_raw_extracted_cover.jpg');
              fs.writeFileSync(rawCoverPath, existingTags.image.imageBuffer);
              srcImg = rawCoverPath;
            }
          } catch (_e) {}
        } else if (fs.existsSync(coverPath)) {
          srcImg = coverPath;
        }

        // 4. Center-crop to 1:1 square cover.jpg using ffmpeg
        if (srcImg && fs.existsSync(srcImg)) {
          const tempCover = path.join(targetFolder, '_square_cover.jpg');
          let croppedOk = false;

          try {
            const res = spawnSync(ffmpegBin, ['-y', '-i', srcImg, '-vf', "crop='min(iw,ih)':'min(iw,ih)'", tempCover], {
              windowsHide: true,
              stdio: 'ignore',
              timeout: 15000,
            });
            if (res.status === 0 && fs.existsSync(tempCover) && fs.statSync(tempCover).size > 0) {
              fs.copyFileSync(tempCover, coverPath);
              croppedOk = true;
            }
          } catch (_e) {}

          if (!croppedOk && !fs.existsSync(coverPath)) {
            try {
              fs.copyFileSync(srcImg, coverPath);
            } catch (_e) {}
          }

          // Clean up temp files
          try {
            if (fs.existsSync(tempCover)) fs.unlinkSync(tempCover);
            const rawExtracted = path.join(targetFolder, '_raw_extracted_cover.jpg');
            if (fs.existsSync(rawExtracted)) fs.unlinkSync(rawExtracted);
          } catch (_e) {}

          if (fs.existsSync(coverPath)) {
            squareCoverPath = coverPath;
          }
        }

        // 5. Augment and write clean ID3 tags on all MP3s
        const files = fs.readdirSync(targetFolder);
        for (const file of files) {
          if (file.toLowerCase().endsWith('.mp3')) {
            const filePath = path.join(targetFolder, file);
            taggedCount++;

            const existingTags = NodeID3.read(filePath) || {};
            const updatedTags = { ...existingTags };

            // Artist
            if (!updatedTags.artist && detectedArtist) {
              updatedTags.artist = detectedArtist;
            }

            // Album
            if (!updatedTags.album && detectedAlbum) {
              updatedTags.album = detectedAlbum;
            }

            // Track number
            if (!updatedTags.trackNumber) {
              const trackMatch = file.match(/^(\d+)\s*[-_.]/);
              if (trackMatch) {
                updatedTags.trackNumber = String(parseInt(trackMatch[1], 10));
              }
            }

            // Date / Year
            if (!updatedTags.year && detectedDate) {
              updatedTags.year = detectedDate.slice(0, 4);
              updatedTags.date = detectedDate;
            }

            // Square Cover Art
            if (squareCoverPath && fs.existsSync(squareCoverPath)) {
              updatedTags.image = squareCoverPath;
            }

            NodeID3.update(updatedTags, filePath);
          }
        }
      }

      onComplete({
        success: true,
        folder: targetFolder || baseDir,
        artist: detectedArtist,
        album: detectedAlbum,
        date: detectedDate,
        trackCount: taggedCount || mp3Files.length,
      });
    } catch (tagErr) {
      console.error('[Downloader] Tagging error:', tagErr);
      onComplete({
        success: true,
        folder: targetFolder || baseDir,
        trackCount: mp3Files.length || downloadedFiles.length,
      });
    }
  });
}

function cancelDownload() {
  if (activeProcess) {
    activeProcess.kill('SIGTERM');
    activeProcess = null;
    return true;
  }
  return false;
}

module.exports = {
  startDownload,
  cancelDownload,
};
