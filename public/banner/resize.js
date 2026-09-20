/**
 * Shrink a photo in the browser before it is sent: long edge 1,600 px,
 * JPEG quality 0.8 (FR-05).
 *
 * Two reasons this happens on the phone and not on the Worker: a modern
 * phone photo is 3-8 MB over a conference Wi-Fi, and iOS hands over HEIC,
 * which the model does not read. The canvas gives us JPEG either way.
 */

const MAX_EDGE = 1600;
const QUALITY = 0.8;

export async function resizeImage(file, maxEdge = MAX_EDGE, quality = QUALITY) {
  const source = await loadImage(file);
  const { width, height } = source;

  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d");
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, targetWidth, targetHeight);

  if (typeof source.close === "function") source.close();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("This image could not be prepared for sending");

  return { blob, width: targetWidth, height: targetHeight };
}

/** Decode the file, honouring the EXIF rotation a phone writes. */
async function loadImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Older Safari: fall through to the <img> path.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("This file is not an image the browser can open"));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
