export interface CacheDirectorySource {
  id: string
  path: string
  enabled: boolean
  exists: boolean
  isDefault: boolean
  isPrimary: boolean
}

export interface RemoveCacheDirectoryOptions {
  deleteFromDisk?: boolean
}

export interface CacheDirectoryOperationResult {
  directories: CacheDirectorySource[]
  deletedFileCount?: number
  error?: string
}
