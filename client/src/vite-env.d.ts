/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_DEV_IGNORE_QUEUE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
