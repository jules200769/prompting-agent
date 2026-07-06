// Reads OpenAI key from Electron keyStore (Settings). stdout only — never log the key.
const { app } = require("electron");

app.whenReady().then(async () => {
  try {
    const { keyStore } = require("../dist/main/keyStore");
    const key = await keyStore.get("openai");
    if (key) process.stdout.write(key);
  } finally {
    app.exit(0);
  }
});
