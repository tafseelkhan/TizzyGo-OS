import QRCode from "qrcode";

export async function generateQRCodeDataURI(text: string): Promise<string> {
  try {
    const options: QRCode.QRCodeToDataURLOptions = {
      errorCorrectionLevel: "H",
      type: "image/png",
      margin: 2,
      width: 300,
    };

    return await QRCode.toDataURL(text, options);
  } catch (error) {
    throw new Error(
      `Failed to generate QR code: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function generateQRCodeBuffer(text: string): Promise<Buffer> {
  try {
    const options: QRCode.QRCodeToBufferOptions = {
      errorCorrectionLevel: "H",
      type: "png",
      margin: 2,
      width: 300,
    };

    return await QRCode.toBuffer(text, options);
  } catch (error) {
    throw new Error(
      `Failed to generate QR code buffer: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function generateQRCodeString(text: string): Promise<string> {
  try {
    const options: QRCode.QRCodeToStringOptions = {
      errorCorrectionLevel: "H",
      type: "svg",
      margin: 2,
      width: 300,
    };

    return await QRCode.toString(text, options);
  } catch (error) {
    throw new Error(
      `Failed to generate QR code string: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
