// src/utils/tizzyos/cab/qrGenerator.ts

import QRCode from "qrcode";
import sharp from "sharp";
import { promises as fs } from "fs";
import path from "path";

// ============================================================
// CONFIGURATION
// ============================================================

const QR_BACKGROUND = "#FFFFFF"; // White background fixed

// ============================================================
// GRADIENT COLOR PAIRS (Bottom-Right to Top-Left)
// ============================================================

// ============================================================
// GRADIENT COLOR PAIRS (Bottom-Right to Top-Left)
// ============================================================

const GRADIENT_PAIRS = [
  // Black Only
  { start: "#000000", end: "#000000" }, // Black to Black Only
];

function getRandomGradient(): { start: string; end: string } {
  const randomIndex = Math.floor(Math.random() * GRADIENT_PAIRS.length);
  return GRADIENT_PAIRS[randomIndex];
}

const APP_CONFIG = {
  LOGO_PATH: path.join(
    __dirname,
    "../../../../public/assets/qr/tizzygo-os.png",
  ),
  QR_SIZE: 500,
  LOGO_SIZE: 180,
  ERROR_CORRECTION: "L" as const,
  MARGIN: 1,
  COLORS: {
    light: QR_BACKGROUND,
  },
};

// ============================================================
// TYPES
// ============================================================

export interface BrandedQROptions {
  size?: number;
  margin?: number;
  darkColor?: string;
  lightColor?: string;
  logoPath?: string;
  logoSize?: number;
  label?: "pickup" | "drop" | null;
  gradientStart?: string;
  gradientEnd?: string;
}

// ============================================================
// CACHE
// ============================================================

let cachedLogoBuffer: Buffer | null = null;

async function loadLogo(logoPath?: string): Promise<Buffer | null> {
  if (cachedLogoBuffer) return cachedLogoBuffer;

  const pathToUse = logoPath || APP_CONFIG.LOGO_PATH;

  try {
    await fs.access(pathToUse);
    cachedLogoBuffer = await fs.readFile(pathToUse);
    return cachedLogoBuffer;
  } catch {
    return null;
  }
}

// ============================================================
// CUSTOM STYLISH SVG GENERATOR WITH GRADIENT
// ============================================================

function generateCustomSVG(
  text: string,
  size: number,
  logoSize: number,
  gradientStart?: string,
  gradientEnd?: string,
): string {
  let qr;

  // Try versions 1 to 40 to find the right one
  for (let v = 1; v <= 40; v++) {
    try {
      qr = QRCode.create(text, {
        version: v,
        errorCorrectionLevel: APP_CONFIG.ERROR_CORRECTION,
      });
      break;
    } catch {
      continue;
    }
  }

  if (!qr) {
    throw new Error(
      `Unable to generate QR code for data length: ${text.length}`,
    );
  }

  const modules = qr.modules;
  const count = modules.size;
  const margin = APP_CONFIG.MARGIN;
  const totalCount = count + margin * 2;
  const cellSize = size / totalCount;

  // Center Coordinates
  const centerCanvasX = size / 2;
  const centerCanvasY = size / 2;

  // Logo radius
  const clearRadius = logoSize / 2 - 35;

  // Get random gradient colors if not provided
  const gradient =
    gradientStart && gradientEnd
      ? { start: gradientStart, end: gradientEnd }
      : getRandomGradient();

  // Helper to check if cell is inside standard Finder Patterns (Corners)
  const isFinderPattern = (r: number, c: number): boolean => {
    if (r < 7 && c < 7) return true; // Top-Left
    if (r < 7 && c >= count - 7) return true; // Top-Right
    if (r >= count - 7 && c < 7) return true; // Bottom-Left
    return false;
  };

  // Calculate gradient position for each dot (0 to 1)
  // Bottom-right = 1, Top-left = 0
  const getGradientPosition = (r: number, c: number): number => {
    const normalizedR = r / count;
    const normalizedC = c / count;
    // Distance from top-left (0) to bottom-right (1)
    return (normalizedR + normalizedC) / 2;
  };

  // Interpolate between two colors
  const interpolateColor = (
    pos: number,
    color1: string,
    color2: string,
  ): string => {
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
          }
        : { r: 0, g: 0, b: 0 };
    };

    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);

    const r = Math.round(rgb1.r + (rgb2.r - rgb1.r) * pos);
    const g = Math.round(rgb1.g + (rgb2.g - rgb1.g) * pos);
    const b = Math.round(rgb1.b + (rgb2.b - rgb1.b) * pos);

    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  };

  let modulesSvg = "";

  // Dynamic Variable Dot Scale Ratios
  const dotSizes = [0.28, 0.38, 0.46, 0.48];

  // Render ONLY Dots with Gradient Colors
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (isFinderPattern(r, c) || !modules.get(r, c)) continue;

      const cx = (c + margin + 0.5) * cellSize;
      const cy = (r + margin + 0.5) * cellSize;

      // Distance check from center for Logo Gap
      const distFromCenter = Math.hypot(cx - centerCanvasX, cy - centerCanvasY);
      if (distFromCenter <= clearRadius) continue;

      // Calculate gradient position (bottom-right to top-left)
      const gradientPos = getGradientPosition(r, c);

      // Get color for this position
      const dotColor = interpolateColor(
        1 - gradientPos, // Reverse so bottom-right has end color
        gradient.start,
        gradient.end,
      );

      // Draw Random Sized Dots with gradient color
      const randomScale = dotSizes[(r + c * 3) % dotSizes.length];
      const radius = cellSize * randomScale;

      modulesSvg += `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${radius.toFixed(2)}" fill="${dotColor}" />`;
    }
  }

  // ============================================================
  // HIGHLY ROUNDED SQUARE FINDER PATTERN WITH GRADIENT
  // ============================================================
  const drawSquareFinder = (row: number, col: number) => {
    const x = (col + margin) * cellSize;
    const y = (row + margin) * cellSize;
    const s = 7 * cellSize;

    // 🔥 EXTRA ROUNDED: Corner radius increased for more rounding
    const cornerRadius = s * 0.35; // Increased from 0.15 to 0.35 for more rounding

    // Get gradient color based on position of finder pattern
    const finderGradientPos = getGradientPosition(row, col);
    const finderColor = interpolateColor(
      1 - finderGradientPos,
      gradient.start,
      gradient.end,
    );

    // Outer square with highly rounded corners
    const outerSize = s;
    const outerX = x;
    const outerY = y;

    // Inner white square with rounded corners
    const innerMargin = s * 0.12;
    const innerSize = s - innerMargin * 2;
    const innerX = x + innerMargin;
    const innerY = y + innerMargin;
    const innerCornerRadius = cornerRadius * 0.6; // Inner square bhi rounded

    // Inner center dot
    const dotRadius = s * 0.2;
    const dotCx = x + s / 2;
    const dotCy = y + s / 2;

    return `
      <!-- Outer Rounded Square with Gradient -->
      <rect x="${outerX.toFixed(2)}" 
            y="${outerY.toFixed(2)}" 
            width="${outerSize.toFixed(2)}" 
            height="${outerSize.toFixed(2)}" 
            rx="${cornerRadius.toFixed(2)}" 
            ry="${cornerRadius.toFixed(2)}" 
            fill="${finderColor}" />
      
      <!-- Inner White Square (Highly Rounded) -->
      <rect x="${innerX.toFixed(2)}" 
            y="${innerY.toFixed(2)}" 
            width="${innerSize.toFixed(2)}" 
            height="${innerSize.toFixed(2)}" 
            rx="${innerCornerRadius.toFixed(2)}" 
            ry="${innerCornerRadius.toFixed(2)}" 
            fill="#FFFFFF" />
      
      <!-- Inner Center Dot with Gradient -->
      <circle cx="${dotCx.toFixed(2)}" 
              cy="${dotCy.toFixed(2)}" 
              r="${dotRadius.toFixed(2)}" 
              fill="${finderColor}" />
    `;
  };

  const findersSvg =
    drawSquareFinder(0, 0) +
    drawSquareFinder(0, count - 7) +
    drawSquareFinder(count - 7, 0);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="${QR_BACKGROUND}" />
    ${modulesSvg}
    ${findersSvg}
  </svg>`;
}

// ============================================================
// MAIN QR GENERATION
// ============================================================

async function generateStyledQRBuffer(
  text: string,
  options: BrandedQROptions,
): Promise<Buffer> {
  const size = options.size || APP_CONFIG.QR_SIZE;
  const logoSize = options.logoSize || APP_CONFIG.LOGO_SIZE;

  const svgString = generateCustomSVG(
    text,
    size,
    logoSize,
    options.gradientStart,
    options.gradientEnd,
  );
  return Buffer.from(svgString);
}

async function addBranding(
  qrBuffer: Buffer,
  options: BrandedQROptions,
): Promise<Buffer> {
  const size = options.size || APP_CONFIG.QR_SIZE;
  const logoSize = options.logoSize || APP_CONFIG.LOGO_SIZE;

  const logoBuffer = await loadLogo(options.logoPath);
  if (!logoBuffer) return qrBuffer;

  const metadata = await sharp(qrBuffer).metadata();
  const qrWidth = metadata.width || size;
  const qrHeight = metadata.height || size;
  const centerX = Math.floor(qrWidth / 2);
  const centerY = Math.floor(qrHeight / 2);

  const resizedLogo = await sharp(logoBuffer)
    .resize(logoSize, logoSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return await sharp(qrBuffer)
    .composite([
      {
        input: resizedLogo,
        left: centerX - Math.floor(logoSize / 2),
        top: centerY - Math.floor(logoSize / 2),
      },
    ])
    .png()
    .toBuffer();
}

// ============================================================
// EXPORTED FUNCTIONS
// ============================================================

export async function generateQRCodeDataURI(
  text: string,
  options: BrandedQROptions = {},
): Promise<string> {
  try {
    const qrBuffer = await generateStyledQRBuffer(text, options);
    const brandedBuffer = await addBranding(qrBuffer, options);
    return `data:image/png;base64,${brandedBuffer.toString("base64")}`;
  } catch (error) {
    throw new Error(`Failed to generate QR: ${error}`);
  }
}

export async function generateQRCodeBuffer(
  text: string,
  options: BrandedQROptions = {},
): Promise<Buffer> {
  try {
    const qrBuffer = await generateStyledQRBuffer(text, options);
    return await addBranding(qrBuffer, options);
  } catch (error) {
    throw new Error(`Failed to generate QR buffer: ${error}`);
  }
}

export async function generateQRCodeString(
  text: string,
  options: BrandedQROptions = {},
): Promise<string> {
  try {
    const size = options.size || APP_CONFIG.QR_SIZE;
    const logoSize = options.logoSize || APP_CONFIG.LOGO_SIZE;
    return generateCustomSVG(
      text,
      size,
      logoSize,
      options.gradientStart,
      options.gradientEnd,
    );
  } catch (error) {
    throw new Error(`Failed to generate QR SVG: ${error}`);
  }
}

export function getQRConfig() {
  return {
    qrSize: APP_CONFIG.QR_SIZE,
    logoSize: APP_CONFIG.LOGO_SIZE,
    errorCorrection: APP_CONFIG.ERROR_CORRECTION,
    colors: APP_CONFIG.COLORS,
  };
}

// Export gradient pairs for external use
export { GRADIENT_PAIRS, getRandomGradient };
