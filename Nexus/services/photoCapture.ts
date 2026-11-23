export async function capturePhoto<T>(operations: {
  preparePicture(): Promise<void>;
  takePicture(): Promise<string>;
  save(uri: string): Promise<T>;
  restoreVideo(): Promise<void>;
}): Promise<T> {
  try {
    await operations.preparePicture();
    const uri = await operations.takePicture();
    return await operations.save(uri);
  } finally {
    await operations.restoreVideo();
  }
}
