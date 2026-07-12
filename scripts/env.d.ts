// Electron adds resourcesPath at runtime; optional for Node-only script typechecking.
declare namespace NodeJS {
  interface Process {
    resourcesPath?: string;
  }
}
