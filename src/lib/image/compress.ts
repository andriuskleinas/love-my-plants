// Client-side photo compression before upload (plan: ~1600 px, JPEG).

export const MAX_EDGE_PX = 1600;
export const JPEG_QUALITY = 0.82;

export function fitWithin(width: number, height: number, maxEdge = MAX_EDGE_PX) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function compressImage(file: Blob, maxEdge = MAX_EDGE_PX): Promise<Blob> {
  // imageOrientation: "from-image" applies EXIF rotation so phone photos aren't sideways.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not compress photo"))), "image/jpeg", JPEG_QUALITY),
  );
}
