/// <reference types="@sveltejs/kit" />
/// <reference types="vite/client" />

import type { ApplicationServices } from '$lib/server/config/application-services';

declare global {
  namespace App {
    interface Locals {
      services: ApplicationServices;
    }
  }
}

export {};
