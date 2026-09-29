const { spawn } = require('child_process');
const http = require('http');

function checkVite(retries = 25) {
  const req = http.get('http://localhost:4000', (res) => {
    console.log('Vite server is ready! Launching Chromatix Desktop...');
    const electronBinary = require('electron');
    const child = spawn(electronBinary, ['.'], { stdio: 'inherit', shell: true });
    child.on('close', (code) => process.exit(code || 0));
  });

  req.on('error', () => {
    if (retries > 0) {
      setTimeout(() => checkVite(retries - 1), 500);
    } else {
      console.error('Timed out waiting for Vite dev server.');
      process.exit(1);
    }
  });
}

checkVite();
