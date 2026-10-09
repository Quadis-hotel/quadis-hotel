import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { randomUUID } from 'crypto'

/**
 * Where uploaded photography is kept.
 *
 * The client has been asked to choose between Cloudinary and S3 and has not
 * answered yet, so this is an interface with S3 behind it rather than S3
 * wired in directly. Adding CloudinaryStore later means implementing two
 * methods and changing IMAGE_STORE — no route, no schema and no UI changes,
 * because nothing above this layer knows where a file physically lives.
 *
 * Nothing here is reachable without an admin token; see routes/admin.ts.
 */

export interface StoredImage {
  /** Full-size URL, long edge 1600px. */
  url: string
  /** 400px thumbnail for admin grids and card views. */
  thumbUrl: string
  /** Opaque handle used to delete both files later. */
  storageKey: string
}

export interface ImageStore {
  save(input: { buffer: Buffer; propertySlug: string; originalName: string }): Promise<StoredImage>
  remove(storageKey: string): Promise<void>
}

/* ------------------------------------------------------------------ */

/**
 * Resizes before storing, deliberately.
 *
 * The client's own photography arrives as 3–4 MB PNGs straight from a camera,
 * and the site already ships 558 MB of images because nothing ever downsized
 * them. Storing what was uploaded would keep growing that number every time a
 * hotel changes a photo. 1600px covers every slot the design has, including a
 * full-bleed hero on a retina laptop.
 *
 * WebP at quality 82 rather than PNG: the same photo lands around a tenth of
 * the size with no visible difference, and every browser in use has supported
 * it for years.
 */
async function derive(buffer: Buffer): Promise<{ full: Buffer; thumb: Buffer }> {
  const [full, thumb] = await Promise.all([
    sharp(buffer).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 }).toBuffer(),
    sharp(buffer).rotate().resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 }).toBuffer(),
  ])
  return { full, thumb }
}

/** `.rotate()` above is not cosmetic — phone photos carry EXIF orientation and
 *  render sideways without it. */

export class S3ImageStore implements ImageStore {
  private client: S3Client
  constructor(
    private bucket: string,
    private region: string = process.env.AWS_REGION || 'us-east-1',
    /** Set when a CDN fronts the bucket; otherwise the S3 website URL is used. */
    private publicBaseUrl?: string
  ) {
    this.client = new S3Client({ region: this.region })
  }

  private urlFor(key: string): string {
    const base = this.publicBaseUrl?.replace(/\/+$/, '')
      ?? `https://${this.bucket}.s3.${this.region}.amazonaws.com`
    return `${base}/${key}`
  }

  async save({ buffer, propertySlug }: { buffer: Buffer; propertySlug: string; originalName: string }) {
    const { full, thumb } = await derive(buffer)
    // A random id, not the uploaded filename: two hotels uploading "front.jpg"
    // must not collide, and a filename from a browser is untrusted input that
    // would otherwise become part of a path.
    const key = `properties/${propertySlug}/${randomUUID()}`

    await Promise.all([
      this.client.send(new PutObjectCommand({
        Bucket: this.bucket, Key: `${key}.webp`, Body: full,
        ContentType: 'image/webp', CacheControl: 'public,max-age=31536000,immutable',
      })),
      this.client.send(new PutObjectCommand({
        Bucket: this.bucket, Key: `${key}-thumb.webp`, Body: thumb,
        ContentType: 'image/webp', CacheControl: 'public,max-age=31536000,immutable',
      })),
    ])

    return { url: this.urlFor(`${key}.webp`), thumbUrl: this.urlFor(`${key}-thumb.webp`), storageKey: key }
  }

  async remove(storageKey: string): Promise<void> {
    // Both objects, and tolerate either already being gone — a delete that
    // half-failed previously must still be able to clean up the remainder.
    await Promise.allSettled([
      this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: `${storageKey}.webp` })),
      this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: `${storageKey}-thumb.webp` })),
    ])
  }
}

/**
 * Resolved once at boot. Without IMAGE_BUCKET the feature is simply off, and
 * the routes answer 503 with a message naming the missing variable — rather
 * than accepting an upload and losing it.
 */
export const imageStore: ImageStore | null = process.env.IMAGE_BUCKET
  ? new S3ImageStore(process.env.IMAGE_BUCKET, process.env.AWS_REGION, process.env.IMAGE_PUBLIC_URL)
  : null
