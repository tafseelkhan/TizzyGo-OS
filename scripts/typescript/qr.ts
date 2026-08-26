// scripts/typescript/qr.ts

import fs from "fs";
import path from "path";
import {
  generateQRCodeBuffer,
  generateQRCodeDataURI,
  getQRConfig,
} from "../../src/utils/tizzyos/cab/qrGenerator";

async function testQR(): Promise<void> {
  console.log("========================================");
  console.log("🧪 TESTING QR CODE GENERATOR");
  console.log("========================================");

  try {
    const config = getQRConfig();
    console.log("📋 Config:", config);

    const testToken =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJib29raW5nSWQiOiJCQ01UOVFUWDhaQ1hDNiIsInRyYWNraW5nSWQiOiJUUktNVDlRVFg4RjVGRkgiLCJyaWRlSWQiOiI2YThlOTI3MDE3ODUyNDFhN2IxYzY0NzgiLCJjdXN0b21lcklkIjoiNmEzM2MzYWIxNTIwNjhhZmM1ODgzYTk5IiwiZHJpdmVySWQiOiI2YTQ3OGZlMTJhODAxNjE5NWIzZmJjNzUiLCJ0eXBlIjoicGlja3VwIiwiaWF0IjoxNzg3NzM3ODc4LCJleHAiOjE3ODc3NDE0NzgsInZlcmlmaWNhdGlvbkZsYWciOmZhbHNlfQ.BVkHdNokDE8R8bGz21j8SwmtPLtYf3ay-J1Ae5p_TpE";

    console.log("\n🔑 Test Token:", testToken.substring(0, 50) + "...");

    console.log("\n📤 Generating QR Code Buffer...");
    const startTime = Date.now();

    const buffer = await generateQRCodeBuffer(testToken, {
      size: 600,
      darkColor: "#1A1A2E",
      lightColor: "#FFFFFF",
    });

    const endTime = Date.now();
    console.log(`✅ QR Code generated in ${endTime - startTime}ms`);
    console.log(`📦 Buffer size: ${buffer.length} bytes`);

    // ✅ STEP 1: DELETE PUBLIC FOLDER IF EXISTS
    const publicDir = path.join(__dirname, "../public");
    if (fs.existsSync(publicDir)) {
      console.log(`🗑️ Deleting existing public folder: ${publicDir}`);
      fs.rmSync(publicDir, { recursive: true, force: true });
      console.log(`✅ Public folder deleted successfully`);
    }

    // ✅ STEP 2: CREATE FRESH PUBLIC FOLDER
    console.log(`📁 Creating fresh public folder: ${publicDir}`);
    fs.mkdirSync(publicDir, { recursive: true });
    console.log(`✅ Public folder created`);

    // ✅ STEP 3: SAVE QR IMAGE
    const outputPath = path.join(publicDir, "qr-test.png");
    fs.writeFileSync(outputPath, buffer);
    console.log(`💾 Saved to: ${outputPath}`);

    // ✅ STEP 4: GENERATE DATA URI
    console.log("\n📤 Generating QR Code Data URI...");
    const dataUri = await generateQRCodeDataURI(testToken, {
      size: 400,
    });
    console.log(`✅ Data URI length: ${dataUri.length} chars`);

    // ✅ STEP 5: SAVE HTML PREVIEW
    const htmlPath = path.join(publicDir, "qr-preview.html");
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <title>QR Code Preview</title>
  <style>
    body { 
      display: flex; 
      justify-content: center; 
      align-items: center; 
      height: 100vh; 
      background: #f0f0f0;
      font-family: Arial, sans-serif;
    }
    .container {
      text-align: center;
      background: white;
      padding: 40px;
      border-radius: 20px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.1);
    }
    img { max-width: 400px; border-radius: 10px; }
    h2 { color: #1A1A2E; margin-bottom: 10px; }
    p { color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h2>📱 TizzyGo-OS QR Code</h2>
    <img src="${dataUri}" alt="QR Code" />
    <p>✅ Premium Stylized QR with Logo + App Name</p>
    <p style="font-size:12px;color:#999;">Token: ${testToken.substring(0, 30)}...</p>
  </div>
</body>
</html>`;
    fs.writeFileSync(htmlPath, htmlContent);
    console.log(`🌐 HTML preview saved to: ${htmlPath}`);

    console.log("\n========================================");
    console.log("✅ QR TEST COMPLETED SUCCESSFULLY!");
    console.log("========================================");
    console.log(`🖼️  Open: ${outputPath}`);
    console.log(`🌐 Open: ${htmlPath} in browser`);
    console.log("========================================");
  } catch (error) {
    console.error("❌ Error generating QR:", error);
  }
}

testQR();
