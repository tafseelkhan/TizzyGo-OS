// src/utils/tizzyos/cab/qrGenerator.ts

import QRCode from "qrcode";
import sharp from "sharp";
import { promises as fs } from "fs";
import path from "path";

// ============================================================
// CONFIGURATION
// ============================================================

const APP_CONFIG = {
  APP_NAME: "TizzyGo-OS",
  LOGO_PATH: path.join(
    __dirname,
    "../../../../public/assets/qr/tizzygo-os.png",
  ),
  QR_SIZE: 600,
  LOGO_SIZE: 100,
  ERROR_CORRECTION: "H" as const,
  MARGIN: 4,
  QR_COLOR: "#0876C9", // Blue
  BACKGROUND: "#FFFFFF",
  LOGO_MAX_SIZE_RATIO: 0.18, // 18% of QR size
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
}

// ============================================================
// QR MATRIX RENDERER - SVG
// ============================================================

interface QRMatrix {
  data: boolean[][];
  size: number;
}

function generateQRMatrix(text: string, options: BrandedQROptions): QRMatrix {
  const qrData = QRCode.create(text, {
    errorCorrectionLevel: APP_CONFIG.ERROR_CORRECTION,
    version: undefined, // Auto-select version
    maskPattern: undefined, // Auto-select mask
  });

  const modules = qrData.modules;
  const size = modules.size;

  // Convert to boolean matrix (true = dark module)
  const matrix: boolean[][] = [];
  for (let row = 0; row < size; row++) {
    const rowData: boolean[] = [];
    for (let col = 0; col < size; col++) {
      // modules.get() returns number (0 or 1), convert to boolean
      rowData.push(modules.get(row, col) === 1);
    }
    matrix.push(rowData);
  }

  return { data: matrix, size };
}

function renderQRToSVG(text: string, options: BrandedQROptions = {}): string {
  const size = options.size || APP_CONFIG.QR_SIZE;
  const margin = options.margin || APP_CONFIG.MARGIN;
  const qrColor = options.darkColor || APP_CONFIG.QR_COLOR;
  const bgColor = options.lightColor || APP_CONFIG.BACKGROUND;
  const logoSize = Math.min(
    options.logoSize || APP_CONFIG.LOGO_SIZE,
    size * APP_CONFIG.LOGO_MAX_SIZE_RATIO,
  );

  // Generate the QR matrix
  const matrix = generateQRMatrix(text, options);
  const moduleSize = (size - margin * 2) / matrix.size;
  const totalSize = size;

  // Start SVG
  let svg = `<svg width="${totalSize}" height="${totalSize}" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision">
  <defs>
    <style>
      .qr-module { fill: ${qrColor}; }
    </style>
  </defs>
  
  <!-- Background -->
  <rect width="${totalSize}" height="${totalSize}" fill="${bgColor}" rx="8"/>
  
  <!-- QR Modules - excluding finder pattern areas -->
  <g>`;

  // Calculate center logo area
  const logoModuleRadius = Math.ceil(logoSize / moduleSize / 2) + 2;
  const centerRow = Math.floor(matrix.size / 2);
  const centerCol = Math.floor(matrix.size / 2);

  // Get finder pattern areas to skip
  const finderPatterns = new Set<string>();
  const finderSize = 7;
  const marginModules = 1;

  // Mark all modules in finder pattern areas
  for (let row = 0; row < finderSize + marginModules; row++) {
    for (let col = 0; col < finderSize + marginModules; col++) {
      // Top-left
      if (
        row < finderSize + marginModules &&
        col < finderSize + marginModules
      ) {
        finderPatterns.add(`${row},${col}`);
      }
      // Top-right
      if (
        row < finderSize + marginModules &&
        col >= matrix.size - finderSize - marginModules
      ) {
        finderPatterns.add(`${row},${col}`);
      }
      // Bottom-left
      if (
        row >= matrix.size - finderSize - marginModules &&
        col < finderSize + marginModules
      ) {
        finderPatterns.add(`${row},${col}`);
      }
    }
  }

  // Render each module
  for (let row = 0; row < matrix.size; row++) {
    for (let col = 0; col < matrix.size; col++) {
      const x = margin + col * moduleSize;
      const y = margin + row * moduleSize;

      // Skip if in finder pattern area (we'll draw these separately)
      if (finderPatterns.has(`${row},${col}`)) {
        continue;
      }

      // Skip if in logo area
      if (
        Math.abs(row - centerRow) <= logoModuleRadius &&
        Math.abs(col - centerCol) <= logoModuleRadius
      ) {
        continue;
      }

      // Draw dark module as rounded dot
      if (matrix.data[row][col]) {
        const moduleRadius = moduleSize * 0.45; // 90% of module size for rounded effect
        const offset = (moduleSize - moduleRadius * 2) / 2;

        svg += `<rect x="${x + offset}" y="${y + offset}" 
                     width="${moduleRadius * 2}" height="${moduleRadius * 2}" 
                     rx="${moduleRadius}" class="qr-module"/>`;
      }
    }
  }

  svg += `</g>`;

  // ============================================================
  // RENDER FINDER PATTERNS
  // ============================================================

  const finderSizePx = finderSize * moduleSize;
  const finderMargin = marginModules * moduleSize;

  // Helper to render a finder pattern
  function renderFinderPattern(posX: number, posY: number): string {
    const totalSize = finderSizePx;
    const outerSize = totalSize;
    const innerSize = totalSize * 0.71; // 5/7 ratio
    const innerMostSize = totalSize * 0.43; // 3/7 ratio
    const cornerRadius = totalSize * 0.12;

    return `
    <!-- Outer blue rounded square -->
    <rect x="${posX}" y="${posY}" 
          width="${outerSize}" height="${outerSize}" 
          rx="${cornerRadius}" fill="${qrColor}"/>
    
    <!-- Inner white rounded square -->
    <rect x="${posX + (outerSize - innerSize) / 2}" 
          y="${posY + (outerSize - innerSize) / 2}" 
          width="${innerSize}" height="${innerSize}" 
          rx="${cornerRadius * 0.7}" fill="${bgColor}"/>
    
    <!-- Inner blue rounded square -->
    <rect x="${posX + (outerSize - innerMostSize) / 2}" 
          y="${posY + (outerSize - innerMostSize) / 2}" 
          width="${innerMostSize}" height="${innerMostSize}" 
          rx="${cornerRadius * 0.5}" fill="${qrColor}"/>`;
  }

  // Add three finder patterns
  svg += `<!-- Finder Patterns -->
  ${renderFinderPattern(margin, margin)}
  ${renderFinderPattern(totalSize - margin - finderSizePx, margin)}
  ${renderFinderPattern(margin, totalSize - margin - finderSizePx)}`;

  // ============================================================
  // RENDER CENTER LOGO AREA (white background)
  // ============================================================

  const logoBgSize = logoSize * 1.3; // White area around logo
  const logoBgX = (totalSize - logoBgSize) / 2;
  const logoBgY = (totalSize - logoBgSize) / 2;
  const logoBgRadius = logoBgSize * 0.1;

  svg += `
  <!-- Center logo background -->
  <rect x="${logoBgX}" y="${logoBgY}" 
        width="${logoBgSize}" height="${logoBgSize}" 
        rx="${logoBgRadius}" fill="${bgColor}" stroke="#E5E7EB" stroke-width="2"/>`;

  // ============================================================
  // END SVG
  // ============================================================

  svg += `</svg>`;

  return svg;
}

// ============================================================
// ADD LOGO TO QR
// ============================================================

async function addLogoToQR(
  qrBuffer: Buffer,
  options: BrandedQROptions,
): Promise<Buffer> {
  const size = options.size || APP_CONFIG.QR_SIZE;
  const logoSize = Math.min(
    options.logoSize || APP_CONFIG.LOGO_SIZE,
    size * APP_CONFIG.LOGO_MAX_SIZE_RATIO,
  );

  // Load logo
  const logoPath = options.logoPath || APP_CONFIG.LOGO_PATH;
  let logoBuffer: Buffer | null = null;

  try {
    await fs.access(logoPath);
    logoBuffer = await fs.readFile(logoPath);
  } catch {
    return qrBuffer;
  }

  if (!logoBuffer) return qrBuffer;

  // Resize logo
  const resizedLogo = await sharp(logoBuffer)
    .resize(logoSize, logoSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  // Position logo in center
  const logoX = (size - logoSize) / 2;
  const logoY = (size - logoSize) / 2;

  // Composite logo onto QR
  return await sharp(qrBuffer)
    .composite([
      {
        input: resizedLogo,
        left: logoX,
        top: logoY,
        blend: "over",
      },
    ])
    .png()
    .toBuffer();
}

// ============================================================
// GENERATE QR WITH ALL PROCESSING
// ============================================================

async function generateQRWithMatrix(
  text: string,
  options: BrandedQROptions = {},
): Promise<Buffer> {
  // Generate SVG from matrix
  const svg = renderQRToSVG(text, options);

  // Convert SVG to PNG with Sharp
  const qrBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

  // Add logo
  const resultBuffer = await addLogoToQR(qrBuffer, options);

  return resultBuffer;
}

// ============================================================
// CACHED LOGO
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
// MAIN EXPORTED FUNCTIONS
// ============================================================

export async function generateQRCodeDataURI(
  text: string,
  options: BrandedQROptions = {},
): Promise<string> {
  try {
    const buffer = await generateQRWithMatrix(text, options);
    const base64 = buffer.toString("base64");
    return `data:image/png;base64,${base64}`;
  } catch (error) {
    throw new Error(`Failed to generate QR: ${error}`);
  }
}

export async function generateQRCodeBuffer(
  text: string,
  options: BrandedQROptions = {},
): Promise<Buffer> {
  try {
    return await generateQRWithMatrix(text, options);
  } catch (error) {
    throw new Error(`Failed to generate QR buffer: ${error}`);
  }
}

export async function generateQRCodeString(
  text: string,
  options: BrandedQROptions = {},
): Promise<string> {
  try {
    // Generate SVG directly
    return renderQRToSVG(text, options);
  } catch (error) {
    throw new Error(`Failed to generate QR SVG: ${error}`);
  }
}

export function getQRConfig() {
  return {
    appName: APP_CONFIG.APP_NAME,
    qrSize: APP_CONFIG.QR_SIZE,
    logoSize: APP_CONFIG.LOGO_SIZE,
    errorCorrection: APP_CONFIG.ERROR_CORRECTION,
    qrColor: APP_CONFIG.QR_COLOR,
    background: APP_CONFIG.BACKGROUND,
  };
}
