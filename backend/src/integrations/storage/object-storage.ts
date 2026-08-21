export interface PutObjectInput {
  key: string;
  body: Uint8Array;
  contentType: string;
  fileName: string;
}

export interface StoredObject {
  key: string;
  size: number;
}

export interface ObjectStorage {
  put(input: PutObjectInput, signal?: AbortSignal): Promise<StoredObject>;
  delete(key: string, signal?: AbortSignal): Promise<void>;
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
}
