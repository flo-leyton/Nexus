export async function capturePhoto<T>(operations: {
  preparePicture(): Promise<void>;
  takePicture(): Promise<string>;
  save(uri: string): Promise<T>;
  restoreVideo(): Promise<void>;
  onRestoreError?(error: unknown, saved: boolean): void;
}): Promise<T> {
  let saved = false;
  try {
    await operations.preparePicture();
    const uri = await operations.takePicture();
    const photo = await operations.save(uri);
    saved = true;
    return photo;
  } finally {
    try { await operations.restoreVideo(); }
    catch (error) {
      if (!operations.onRestoreError) throw error;
      operations.onRestoreError(error, saved);
    }
  }
}
