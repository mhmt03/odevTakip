const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dir = 'f:/mehmetgundonergmail/developing/react/odevTakip/assets';
const files = ['icon.png', 'android-icon-foreground.png', 'splash-icon.png', 'app_logo.png'];

files.forEach(f => {
  const p = path.join(dir, f);
  if (fs.existsSync(p)) {
    const tmp = p + '.tmp.png';
    const ps = `Add-Type -AssemblyName System.Drawing; $i = [System.Drawing.Image]::FromFile('${p.replace(/\//g, '\\')}'); $b = new-object System.Drawing.Bitmap $i.Width, $i.Height; $g = [System.Drawing.Graphics]::FromImage($b); $g.DrawImage($i, 0, 0, $i.Width, $i.Height); $i.Dispose(); $g.Dispose(); $b.Save('${tmp.replace(/\//g, '\\')}', [System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose();`;
    execSync(`powershell -Command "${ps}"`);
    fs.renameSync(tmp, p);
    console.log('Re-encoded to PNG:', f);
  }
});
