import type { Restaurant } from "./data";

/**
 * Per-restaurant Cloudinary uploads for EFT proof of payment.
 *
 * Unsigned preset, plain `fetch`, only `secure_url` kept — the same pattern the
 * admin consoles already use. No SDK and no API secret ever reaches this app.
 */

export type CloudinaryTarget = { cloudName: string; uploadPreset: string };

/**
 * A restaurant can only take EFT if it has its own Cloudinary account. There is
 * deliberately no platform-wide fallback: uploading a customer's proof of payment
 * into some other restaurant's account would be worse than refusing the method.
 */
export function cloudinaryTargetFor(
  restaurant: Restaurant | null | undefined,
): CloudinaryTarget | null {
  const cloudName = restaurant?.cloudinaryCloudName?.trim();
  const uploadPreset = restaurant?.cloudinaryUploadPreset?.trim();
  if (!cloudName || !uploadPreset) return null;
  return { cloudName, uploadPreset };
}

/**
 * Uploads to `/auto/upload` rather than `/image/upload` — proof of payment may be
 * a PDF, which the image-only endpoint rejects.
 */
export async function uploadProofOfPayment(file: File, target: CloudinaryTarget): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", target.uploadPreset);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(target.cloudName)}/auto/upload`,
    { method: "POST", body: formData },
  );

  const payload = (await response.json().catch(() => null)) as {
    secure_url?: string;
    error?: { message?: string };
  } | null;

  if (!response.ok || !payload?.secure_url) {
    throw new Error(payload?.error?.message || "The upload did not go through.");
  }

  return payload.secure_url;
}
