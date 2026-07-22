'use strict';

/**
 * Exact PNG comparison using the browser's own Canvas (no pngjs dependency).
 * Requires an already-open Playwright `page` so callers that already have a
 * browser open (capture-reftest.cjs) don't need to spin up a second one.
 */

const fs = require('fs');

// PNG width/height live at fixed offsets in the IHDR chunk (bytes 16-23,
// big-endian). Reading them directly avoids a pngjs dependency.
function getPngDimensions(pngPath) {
  const buf = fs.readFileSync(pngPath);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// eslint-disable-next-line no-undef -- runs inside page.evaluate, not Node
function browserCompare({ dataUrlA, dataUrlB, masks }) {
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('failed to load image'));
      img.src = src;
    });
  }

  function toImageData(img) {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, img.width, img.height);
  }

  function isMasked(x, y) {
    return masks.some((m) => x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height);
  }

  return Promise.all([loadImage(dataUrlA), loadImage(dataUrlB)]).then(([imgA, imgB]) => {
    const a = toImageData(imgA);
    const b = toImageData(imgB);
    const width = Math.max(a.width, b.width);
    const height = Math.max(a.height, b.height);

    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = width;
    diffCanvas.height = height;
    const diffCtx = diffCanvas.getContext('2d');
    const diffData = diffCtx.createImageData(width, height);

    let diffPixelCount = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const outIdx = (y * width + x) * 4;
        const inA = x < a.width && y < a.height;
        const inB = x < b.width && y < b.height;
        const masked = isMasked(x, y);
        let differs = false;
        let sample = [255, 255, 255, 255];

        if (!masked) {
          if (!inA || !inB) {
            differs = true;
          } else {
            const idxA = (y * a.width + x) * 4;
            const idxB = (y * b.width + x) * 4;
            differs =
              a.data[idxA] !== b.data[idxB] ||
              a.data[idxA + 1] !== b.data[idxB + 1] ||
              a.data[idxA + 2] !== b.data[idxB + 2] ||
              a.data[idxA + 3] !== b.data[idxB + 3];
            sample = [a.data[idxA], a.data[idxA + 1], a.data[idxA + 2], 255];
          }
        }

        if (differs) {
          diffPixelCount++;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          diffData.data[outIdx] = 255;
          diffData.data[outIdx + 1] = 0;
          diffData.data[outIdx + 2] = 0;
          diffData.data[outIdx + 3] = 255;
        } else {
          diffData.data[outIdx] = sample[0];
          diffData.data[outIdx + 1] = sample[1];
          diffData.data[outIdx + 2] = sample[2];
          diffData.data[outIdx + 3] = sample[3];
        }
      }
    }

    diffCtx.putImageData(diffData, 0, 0);

    return {
      dimensionsA: { width: a.width, height: a.height },
      dimensionsB: { width: b.width, height: b.height },
      sameDimensions: a.width === b.width && a.height === b.height,
      diffPixelCount,
      diffBounds:
        diffPixelCount > 0 ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null,
      diffImageDataUrl: diffCanvas.toDataURL('image/png'),
    };
  });
}

/**
 * Compare two PNG files pixel-for-pixel via an existing Playwright page.
 * `masks` is a list of { x, y, width, height } rectangles (image pixel space)
 * to exclude from the diff, e.g. to isolate labels or unrelated content.
 */
async function compareImagesWithPage(page, pathA, pathB, { diffOutputPath, masks = [] } = {}) {
  const dataUrlA = `data:image/png;base64,${fs.readFileSync(pathA).toString('base64')}`;
  const dataUrlB = `data:image/png;base64,${fs.readFileSync(pathB).toString('base64')}`;

  const result = await page.evaluate(browserCompare, { dataUrlA, dataUrlB, masks });

  if (diffOutputPath) {
    const base64 = result.diffImageDataUrl.split(',')[1];
    fs.writeFileSync(diffOutputPath, Buffer.from(base64, 'base64'));
  }
  delete result.diffImageDataUrl;
  return result;
}

module.exports = { compareImagesWithPage, getPngDimensions };
