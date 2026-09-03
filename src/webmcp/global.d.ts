import type { ModelContextPort } from './registerTools'

declare global {
  interface Document {
    modelContext?: ModelContextPort
  }
}

export {}
