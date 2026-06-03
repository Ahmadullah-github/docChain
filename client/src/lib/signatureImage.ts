export type SignatureCrop = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

export type SignatureEditSettings = {
  crop: SignatureCrop;
  contrast: number;
  rotate: 0 | 90 | 180 | 270;
  threshold: number;
  zoom: number;
};

export type SignatureQuality = {
  errors: string[];
  inkRatio: number;
  isUsable: boolean;
  warnings: string[];
};

export type SignatureProcessResult = {
  dataUrl: string;
  quality: SignatureQuality;
};

export const defaultSignatureEditSettings: SignatureEditSettings = {
  contrast: 1.25,
  crop: { bottom: 0, left: 0, right: 0, top: 0 },
  rotate: 0,
  threshold: 188,
  zoom: 1
};

type InkBounds = {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
  pixels: number;
};

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read signature image."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error("Could not load signature image."));
    image.onload = () => resolve(image);
    image.src = src;
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isInkPixel(red: number, green: number, blue: number, alpha: number, threshold: number) {
  if (alpha < 30) {
    return false;
  }

  const lightness = (red + green + blue) / 3;
  const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
  const blueInk = blue > red + 12 && blue > green + 4 && lightness < threshold + 42;
  const darkInk = lightness < threshold - 42 && spread > 12;
  const blackInk = lightness < threshold - 62;

  return blueInk || darkInk || blackInk;
}

function transparentPixel(data: Uint8ClampedArray, index: number) {
  data[index + 3] = 0;
}

function strengthenInkPixel(data: Uint8ClampedArray, index: number, contrast: number) {
  data[index] = clamp((data[index] - 128) * contrast + 128, 0, 255);
  data[index + 1] = clamp((data[index + 1] - 128) * contrast + 128, 0, 255);
  data[index + 2] = clamp((data[index + 2] - 128) * contrast + 128, 0, 255);
  data[index + 3] = 255;
}

function detectBoundsFromImageData(imageData: ImageData, threshold: number): InkBounds | null {
  const data = imageData.data;
  const { width, height } = imageData;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let pixels = 0;

  for (let index = 0; index < data.length; index += 4) {
    if (!isInkPixel(data[index], data[index + 1], data[index + 2], data[index + 3], threshold)) {
      continue;
    }

    const x = (index / 4) % width;
    const y = Math.floor((index / 4) / width);
    pixels += 1;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return pixels ? { maxX, maxY, minX, minY, pixels } : null;
}

function qualityForBounds(bounds: InkBounds | null, width: number, height: number): SignatureQuality {
  const errors: string[] = [];
  const warnings: string[] = [];
  const area = Math.max(1, width * height);
  const inkRatio = bounds ? bounds.pixels / area : 0;
  const signatureWidth = bounds ? bounds.maxX - bounds.minX + 1 : 0;
  const signatureHeight = bounds ? bounds.maxY - bounds.minY + 1 : 0;

  if (!bounds || bounds.pixels < 80 || inkRatio < 0.0005) {
    errors.push("No clear handwriting was detected. Retake the photo closer to the signature.");
  }
  if (inkRatio > 0.18) {
    errors.push("Too much background or noise remains. Crop tighter or increase background removal.");
  }
  if (bounds && (signatureWidth < 70 || signatureHeight < 16)) {
    errors.push("The signature is too small. Retake or crop closer so the handwriting fills the preview.");
  }
  if (bounds && signatureWidth / Math.max(1, signatureHeight) < 1.1) {
    warnings.push("The crop is narrow. A wider signature crop usually prints better on official documents.");
  }
  if (bounds && signatureWidth > width * 0.96 && signatureHeight > height * 0.88) {
    errors.push("The whole photo is being treated as ink. Increase background removal or retake on plain paper.");
  }

  return {
    errors,
    inkRatio,
    isUsable: errors.length === 0,
    warnings
  };
}

function drawEditedImage(image: HTMLImageElement, settings: SignatureEditSettings) {
  const maxDimension = 1400;
  const baseScale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight, 1));
  const width = Math.max(1, Math.round(image.naturalWidth * baseScale));
  const height = Math.max(1, Math.round(image.naturalHeight * baseScale));
  const baseCanvas = document.createElement("canvas");
  baseCanvas.width = width;
  baseCanvas.height = height;
  const baseContext = baseCanvas.getContext("2d", { willReadFrequently: true });
  if (!baseContext) {
    throw new Error("Could not process signature image.");
  }
  baseContext.drawImage(image, 0, 0, width, height);

  const left = Math.round(width * clamp(settings.crop.left, 0, 0.8));
  const top = Math.round(height * clamp(settings.crop.top, 0, 0.8));
  const right = Math.round(width * clamp(settings.crop.right, 0, 0.8));
  const bottom = Math.round(height * clamp(settings.crop.bottom, 0, 0.8));
  const cropWidth = Math.max(16, width - left - right);
  const cropHeight = Math.max(16, height - top - bottom);
  const rotateSideways = settings.rotate === 90 || settings.rotate === 270;
  const outputWidth = rotateSideways ? cropHeight : cropWidth;
  const outputHeight = rotateSideways ? cropWidth : cropHeight;
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Could not process signature image.");
  }

  context.save();
  context.translate(outputWidth / 2, outputHeight / 2);
  context.rotate((settings.rotate * Math.PI) / 180);
  context.scale(settings.zoom, settings.zoom);
  context.drawImage(baseCanvas, left, top, cropWidth, cropHeight, -cropWidth / 2, -cropHeight / 2, cropWidth, cropHeight);
  context.restore();

  return canvas;
}

function cropToInk(canvas: HTMLCanvasElement, threshold: number) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Could not crop signature image.");
  }
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const bounds = detectBoundsFromImageData(imageData, threshold);
  if (!bounds) {
    return { bounds, canvas };
  }

  const padding = Math.round(Math.max(canvas.width, canvas.height) * 0.035);
  const x = Math.max(0, bounds.minX - padding);
  const y = Math.max(0, bounds.minY - padding);
  const width = Math.min(canvas.width - x, bounds.maxX - bounds.minX + padding * 2);
  const height = Math.min(canvas.height - y, bounds.maxY - bounds.minY + padding * 2);
  const cropped = document.createElement("canvas");
  cropped.width = Math.max(1, width);
  cropped.height = Math.max(1, height);
  const cropContext = cropped.getContext("2d");
  if (!cropContext) {
    throw new Error("Could not crop signature image.");
  }
  cropContext.drawImage(canvas, x, y, width, height, 0, 0, width, height);

  return { bounds, canvas: cropped };
}

export async function processSignatureImage(dataUrl: string, settings: SignatureEditSettings): Promise<SignatureProcessResult> {
  const image = await loadImage(dataUrl);
  const prepared = drawEditedImage(image, settings);
  const context = prepared.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Could not process signature image.");
  }
  const imageData = context.getImageData(0, 0, prepared.width, prepared.height);
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    if (isInkPixel(data[index], data[index + 1], data[index + 2], data[index + 3], settings.threshold)) {
      strengthenInkPixel(data, index, settings.contrast);
    } else {
      transparentPixel(data, index);
    }
  }

  context.putImageData(imageData, 0, 0);
  const cropped = cropToInk(prepared, settings.threshold);
  const finalContext = cropped.canvas.getContext("2d", { willReadFrequently: true });
  if (!finalContext) {
    throw new Error("Could not process signature image.");
  }
  const finalImageData = finalContext.getImageData(0, 0, cropped.canvas.width, cropped.canvas.height);
  const finalBounds = detectBoundsFromImageData(finalImageData, settings.threshold);
  const quality = qualityForBounds(finalBounds, cropped.canvas.width, cropped.canvas.height);

  return {
    dataUrl: cropped.canvas.toDataURL("image/png"),
    quality
  };
}

export async function autoCropForSignature(dataUrl: string, threshold = defaultSignatureEditSettings.threshold): Promise<SignatureCrop> {
  const image = await loadImage(dataUrl);
  const maxDimension = 1000;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight, 1));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Could not analyze signature image.");
  }
  context.drawImage(image, 0, 0, width, height);
  const bounds = detectBoundsFromImageData(context.getImageData(0, 0, width, height), threshold);
  if (!bounds) {
    throw new Error("No clear handwriting was detected. Retake the photo closer to the signature.");
  }

  const paddingX = Math.round(width * 0.08);
  const paddingY = Math.round(height * 0.08);
  return {
    bottom: clamp((height - Math.min(height, bounds.maxY + paddingY)) / height, 0, 0.8),
    left: clamp(Math.max(0, bounds.minX - paddingX) / width, 0, 0.8),
    right: clamp((width - Math.min(width, bounds.maxX + paddingX)) / width, 0, 0.8),
    top: clamp(Math.max(0, bounds.minY - paddingY) / height, 0, 0.8)
  };
}
