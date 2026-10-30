/// <reference types="vite/client" />

import type { MdWorkApi } from '../shared/contracts';

declare global {
  interface Window {
    mdwork: MdWorkApi;
  }
}

export {};
