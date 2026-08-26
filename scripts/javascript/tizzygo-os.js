const fs = require("fs");
const path = require("path");

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!entry.name.endsWith(".ts")) continue;

    checkFile(fullPath);
  }
}

function checkFile(file) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);

  const fieldIndexes = {};
  const schemaIndexes = {};

  lines.forEach((line, i) => {
    // Detect: userId: { ... index: true ... }
    const fieldMatch = line.match(/^\s*([A-Za-z0-9_.]+)\s*:\s*\{/);

    if (fieldMatch) {
      const field = fieldMatch[1];

      let block = line;

      let j = i + 1;
      while (j < lines.length && !lines[j].includes("},")) {
        block += "\n" + lines[j];
        j++;
      }

      if (j < lines.length) block += "\n" + lines[j];

      if (block.includes("index: true") || block.includes("unique: true")) {
        fieldIndexes[field] = fieldIndexes[field] || [];
        fieldIndexes[field].push(i + 1);
      }
    }

    // Detect: schema.index({ userId: 1 })
    const schemaMatch = line.match(
      /\.index\s*\(\s*\{\s*["']?([^"':]+)["']?\s*:\s*1/,
    );

    if (schemaMatch) {
      const field = schemaMatch[1];

      schemaIndexes[field] = schemaIndexes[field] || [];
      schemaIndexes[field].push(i + 1);
    }
  });

  let found = false;

  Object.keys(fieldIndexes).forEach((field) => {
    if (schemaIndexes[field]) {
      if (!found) {
        console.log("\n========================================");
        console.log("FILE:", file);
        console.log("========================================");
        found = true;
      }

      console.log(`❌ Duplicate Index: ${field}`);
      console.log(
        `   Field index/unique at line(s): ${fieldIndexes[field].join(", ")}`,
      );
      console.log(
        `   schema.index() at line(s): ${schemaIndexes[field].join(", ")}`,
      );
      console.log("");
    }
  });
}

console.log("Scanning project...");
walk("./src");
console.log("\nDone.");
